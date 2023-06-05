const CONFIG = require("../../../config.json");
const imageService = require("../helpers/imageService");
const StableDiffusion = require("../stable-diffusion");
//const EventEmitter = require("events");

async function handleImageGeneration(messageData) {
    const { imagePrompt } = messageData;

    if ((typeof imagePrompt != "string") || (imagePrompt.length <= 0))
        return null;

    const imageData = await StableDiffusion
        .generateImage(
            imagePrompt,
            CONFIG.IMAGE_GENERATION_NEGATIVE_PROMPT,
            estimationData => dataStream.emit("etaUpdate", estimationData)
        )
    const { fileName } = await imageService.handleDataUpload(imageData);
    return fileName;
}

module.exports = handleImageGeneration;