const VercelAPI = require("./vercelapi");
const vercel = new VercelAPI();

module.exports = async function* queryVercel(model, prompt, system) {
    const req = await vercel.query({
        "prompt": `${system}\n\n${prompt}`,
        "model": vercel.models[model],
        "temperature": 1,
        "maxTokens": 200,
        "topK": 1,
        "topP": 1,
        "frequencyPenalty": 1,
        "presencePenalty": 1,
        "stopSequences": [
            "\n\nHuman:"
        ]
    });
    if (req.status == 429) {
        throw new Error("Resource is rate limited");
    } else if (req.status != 200) {
        throw new Error("Request failed with status " + req.status);
    }
    const stream = req.data;
    let isDone = false;
    let chunks = [];
    stream.on("data", data => chunks.push(Buffer.from(data).toString("utf-8")));
    stream.on("end", () => {
        isDone = true;
        chunks.push("[END]");
    });
    stream.on("error", err => {
        throw err;
        //chunks.push();
    });
    while (true) {
        await new Promise(r => setTimeout(r, 50));
        const chunk = chunks.shift();
        if (chunk == "[END]")
            break;
        if (typeof chunk != "string")
            continue;
        const lines = chunk.match(/(?<=\").+(?!\\)(?=\")/gm);
        if ((typeof lines != "object") || (typeof lines?.length != "number") || (lines.length <= 0))
            continue;
        for (const line of [ ...lines ]) {
            if (typeof line != "string")
                continue;
            const cleanedLine = JSON.parse(`"${line.trim()}"`);
            if (typeof cleanedLine != "string")
                continue;
            if (cleanedLine.length <= 0)
                continue;
            yield cleanedLine.trim();
        }
        if (isDone)
            break;
    }
}