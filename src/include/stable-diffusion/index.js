const axios = require("axios");

class StableDiffusion {
    constructor() {
    }
    
    static async generateImage(prompt, negativePrompt) {
        //allow style_id, cfg & aspect_ration to change
        const options = {
            "model_version": 1,
            "prompt": prompt,
            "style_id": 21,
            "aspect_ratio": "1:1",
            "cfg": 9.5,
            "negative_prompt": negativePrompt
        }
        const formData = new FormData();
        for (const [k, v] of Object.entries(options))
            formData.append(k, v);
        formData.append("model_version", 1);
        formData.append("priority", 1);
        const genReq = await axios.post("https://inferenceengine.vyro.ai/sd", formData, { responseType: "arraybuffer" });
        if (genReq.status != 200)
            throw new Error("Generation failed");
        //genReq.data.pipe(res);
        return Buffer.from(genReq.data, "binary").toString("base64");
    }
}

module.exports = StableDiffusion;