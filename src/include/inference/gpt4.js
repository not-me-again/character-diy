const axios = require("axios");

function waitForChunk(stream) {
    return new Promise((resolve, reject) => {
        stream.once("data", resolve);
        stream.once("end", resolve);
        stream.once("error", reject);
    });
}

module.exports = async function* queryGPT4(prompt, system) {
    const abortController = new AbortController();
    const req = await axios.post("https://gpt4.gravityengine.cc/api/openai/v1/chat/completions", {
        "model": "gpt-4",
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
        "max_tokens": 512,
        "presence_penalty": 0,
        "stream": true
    }, {
        validateStatus: () => true,
        responseType: "stream",
        abortController
    });
    if (req.status != 200) {
        throw new Error(`Request failed\nStatus = ${req.status}\nData = ${JSON.stringify(req.data, undefined, 2)}`);
    }
    let isAborted = false;
    let timeoutDaemon = setTimeout(() => {
        abortController.abort();
        isAborted = true;
    }, 60e3);
    const stream = req.data;
    let str = "";
    while (!isAborted) {
        const line = await waitForChunk(stream);
        const [, chunk] = line.split("data: ");
        if (chunk == "[DONE]")
            break;
        const { choices } = JSON.parse(chunk);
        if ((typeof choices != "object") || (choices.length <= 0))
            continue;
        const { delta } = choices[0];
        if (typeof delta != "object")
            continue;
        const { content } = delta;
        if ((typeof content != "string") || (content.length <= 0))
            continue;
        str += content;
        yield str;
    }
    if (isAborted)
        throw new Error("Timed out");
    clearTimeout(timeoutDaemon);
}