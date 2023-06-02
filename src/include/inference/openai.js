const axios = require("axios");

module.exports = async function* queryGPT(model, prompt, system) {
    const abortController = new AbortController();
    const req = await axios.post(
    model == "gpt-4"
        ? "https://gpt4.gravityengine.cc/api/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
    {
        "model": "gpt-3.5-turbo",
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
        "presence_penalty": 0,
        "stream": true
    }, {
        validateStatus: () => true,
        responseType: "stream",
        abortController,
        headers: {
            authorization: process.env.OPEN_AI_KEY
        }
    });
    if (req.status != 200) {
        throw new Error(`Request failed\nStatus = ${req.status}`);
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