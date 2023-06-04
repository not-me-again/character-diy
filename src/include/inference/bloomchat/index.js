const BloomAPI = require("./bloomapi");

const bloom = new BloomAPI();
bloom.init();

const SPEAKER_REGEX = /^(.*?)(?=:\ )/gm

function getStops(userPrompt, format) {
    let speakers = userPrompt.match(SPEAKER_REGEX);
    let cleanedSpeakers = [];
    for (let speaker of speakers)
        if (typeof format == "string")
            cleanedSpeakers.push(format.replace("{{USER}}", speaker));
        else
            cleanedSpeakers.push(speaker);
    return cleanedSpeakers;
}

function buildPrompt(model, userPrompt, systemPrompt) {
    if (model.startsWith("BLOOMChat")) {
        userPrompt = userPrompt.replace(SPEAKER_REGEX, "<$1>: ");
        return `${systemPrompt}\n\n${userPrompt}`;
    } else if (model.startsWith("vicuna")) {
        return `USER:\n${systemPrompt}\nASSISTANT:\n${userPrompt}`;
    }
}

module.exports = {
    async *queryBLOOM(...opts) {
        const prompt = buildPrompt(...opts);
        const options = {
            "max_tokens": 1024,
            "stop": [
                "<bot>",
                "<human>",
                "</s>",
                ...getStops(opts[1], "<{{USER}}>:")
            ],
            "top_p": 1,
            "top_k": 40,
            "repetition_penalty": 1,
            "temperature": 0.6,
            "model": "sambanovasystems/BLOOMChat-176B-v1",
            "stream_tokens": true,
            "repetitive_penalty": 1
        };
        for await (const chunk of bloom.sendMessage(prompt, options))
            yield chunk;
    },
    async *queryVicuna(...opts) {
        const prompt = buildPrompt(...opts);
        const options = {
            "max_tokens": 1024,
            "stop": [
                "USER:",
                "ASSISTANT:",
                "</s>",
                ...getStops(opts[1], "{{USER}}:")
            ],
            "top_p": 1,
            "top_k": 40,
            "repetition_penalty": 1,
            "temperature": 0.8,
            "model": "vicuna-13b",
            "stream_tokens": true,
            "repetitive_penalty": 1
        };
        for await (const chunk of bloom.sendMessage(prompt, options))
            yield chunk;
    }
}