const CONFIG = require("../../../config.json");
const StableDiffusion = require("../stable-diffusion");
const EventEmitter = require("events");

function handleImageGeneration(messageData) {
    let dataStream = new EventEmitter();
    const { imagePrompt } = messageData;

    if ((typeof imagePrompt != "string") || (imagePrompt.length <= 0))
        return dataStream.emit("imageDone", {
            prompt: null,
            imageCandidates: []
        });

    StableDiffusion
        .generateImage(
            imagePrompt,
            CONFIG.IMAGE_GENERATION_NEGATIVE_PROMPT,
            estimationData => dataStream.emit("etaUpdate", estimationData)
        )
        .then(response => 
            dataStream.emit("imageDone", {
                prompt: imagePrompt,
                imageCandidates: response?.images
            })
        ).catch(err => dataStream.emit("error", err));

    return dataStream;
}

module.exports = handleImageGeneration;