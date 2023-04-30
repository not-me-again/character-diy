const CONFIG = require("../../../config.json");
const StableDiffusion = require("../stable-diffusion");

async function handleImageGeneration(messageData) {
    const { imagePrompt } = messageData;

    if ((typeof imagePrompt != "string") || (imagePrompt.length <= 0))
        return {
            prompt: null,
            imageCandidates: []
        }

    const { images: generatedImages } = await StableDiffusion.generateImage(imagePrompt, CONFIG.IMAGE_GENERATION_NEGATIVE_PROMPT);
    return {
        prompt: imagePrompt,
        imageCandidates: generatedImages
    }
}

module.exports = handleImageGeneration;