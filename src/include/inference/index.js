const queryGPT = require("./openai");
const backends = {
    "gpt-4": queryGPT,
    "gpt-3.5-turbo": queryGPT
}

class Inferencer {
    constructor() {}

    static async *query({ model, system, prompt }) {
        const func = backends[model];
        if (typeof func != "function")
            throw new Error(`Unknown model "${model}"`);
        for await (const chunk of func(model, prompt, system))
            yield chunk;
    }
}

module.exports = Inferencer;