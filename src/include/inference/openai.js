const axios = require("axios");

const API_KEYS = process.env.OPEN_AI_KEYS.split(",");
function getAPIKey(tries) {
    if (typeof tries != "number")
        tries = 0;
    return `Bearer sk-${API_KEYS[tries++]}`;
}

async function getRequestStream({ abortController, model, prompt, system }) {
    for (let tries = 0; tries < API_KEYS.length; tries++) {
        const req = await axios.post(
            model == "gpt-4"
                ? "https://gpt4.gravityengine.cc/api/openai/v1/chat/completions"
                : "https://api.openai.com/v1/chat/completions",
            {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": system
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "stream": true,
                "temperature": 0.7,
                "max_tokens": 768,
                "presence_penalty": 1.2,
                "stream": true
            }, {
                validateStatus: () => true,
                responseType: "stream",
                abortController,
                headers: {
                    ...((model == "gpt-4") ? {} : { authorization: getAPIKey(tries) })
                }
            });
        if (req.status == 429)
            continue;
        return req;
    }
}

async function* queryGPT(model, prompt, system) {
    const abortController = new AbortController();
    const req = await getRequestStream({ abortController, model, prompt, system });
    if ((typeof req != "object") || (req.status == 429)) {
        throw new Error("Endpoint is rate-limited, try again later");
    } else if (req.status == 404) {
        throw new Error(`Model ${model} is not currently available`);
    } else if (req.status != 200) {
        throw new Error(`Request failed with status ${req.status}`);
    }
    let isAborted = false;
    let timeoutDaemon = setTimeout(() => {
        abortController.abort();
        isAborted = true;
    }, 60e3);
    const stream = req.data;
    let str = "";
    let dataChunks = [];
    let currentChunk = "";
    stream.on("data", data => {
        const safeData = Buffer.from(data).toString("utf-8");
        currentChunk += safeData;
        if (safeData.endsWith("\n")) {
            dataChunks.push(currentChunk);
            currentChunk = "";
        }
    });
    stream.on("error", () => isAborted = true);
    while (true) {
        let isDone;
        abortController.signal.throwIfAborted();
        await new Promise(r => setTimeout(r, 1));
        const rawLine = dataChunks.shift();
        if (!rawLine)
            continue;

        for (const line of rawLine.split("\n")) {
            try {
                const [, chunk] = line.split("data: ");
                if (typeof chunk != "string")
                    continue;
                if (chunk == "[DONE]") {
                    isDone = true;
                    break; // end
                }
                if ((!chunk.startsWith("{")) || (!chunk.endsWith("}")))
                    continue; // this causes bugs and IDK why
                const { choices } = JSON.parse(chunk);
                if ((typeof choices != "object") || (choices.length <= 0))
                    continue;
                const { delta, finish_reason } = choices[0];
                if (finish_reason != null) {
                    isDone = true;
                    break; // end
                }
                if (typeof delta != "object")
                    continue;
                const { content } = delta;
                if ((typeof content != "string") || (content.length <= 0))
                    continue;
                str += content;
            } finally {}
        }

        yield str;

        if (isDone)
            break;
    }
    if (isAborted)
        throw new Error("Timed out");
    clearTimeout(timeoutDaemon);
}

async function* queryText(model, prompt, system) {
    const abortController = new AbortController();
    const req = await axios.post("https://api.openai.com/v1/completions",
    {
            "max_tokens": 1024,
            "prompt": `${system}\n${prompt}`,
            model,
            "stream": true,
            "temperature": 0.7
    }, {
        validateStatus: () => true,
        responseType: "stream",
        abortController,
        headers: {
            authorization: process.env.OPEN_AI_KEY
        }
    });
    if (req.status == 429) {
        throw new Error("Endpoint is rate-limited, try again later");
    } else if (req.status == 404) {
        throw new Error(`Model ${model} is not currently available`);
    } else if (req.status != 200) {
        throw new Error(`Request failed with status ${req.status}`);
    }
    let isAborted = false;
    let timeoutDaemon = setTimeout(() => {
        abortController.abort();
        isAborted = true;
    }, 60e3);
    const stream = req.data;
    let str = "";
    let dataChunks = [];
    let currentChunk = "";
    stream.on("data", data => {
        const safeData = Buffer.from(data).toString("utf-8");
        currentChunk += safeData;
        if (safeData.endsWith("\n")) {
            dataChunks.push(currentChunk);
            currentChunk = "";
        }
    });
    stream.on("error", () => isAborted = true);
    while (true) {
        let isDone;
        abortController.signal.throwIfAborted();
        await new Promise(r => setTimeout(r, 1));
        const rawLine = dataChunks.shift();
        if (!rawLine)
            continue;

        for (const line of rawLine.split("\n")) {
            try {
                const [, chunk] = line.split("data: ");
                if (typeof chunk != "string")
                    continue;
                if (chunk == "[DONE]") {
                    isDone = true;
                    break; // end
                }
                if ((!chunk.startsWith("{")) || (!chunk.endsWith("}")))
                    continue; // this causes bugs and IDK why
                const { choices } = JSON.parse(chunk);
                if ((typeof choices != "object") || (choices.length <= 0))
                    continue;
                const { text, finish_reason } = choices[0];
                if (finish_reason != null) {
                    isDone = true;
                    break; // end
                }
                if (typeof text != "string")
                    continue;
                str += text;
            } finally {}
        }

        yield str;

        if (isDone)
            break;
    }
    if (isAborted)
        throw new Error("Timed out");
    clearTimeout(timeoutDaemon);
}

module.exports = async function* queryOpenAI(...opts) {
    const [ model ] = opts;
    if (model.startsWith("gpt-"))
        for await (const chunk of queryGPT(...opts))
            yield chunk;
    else if (model.startsWith("text-"))
        for await (const chunk of queryText(...opts))
            yield chunk;
    else
        throw new Error("Unknown OpenAI model " + model);
}