const { FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");
const db = require("../db");
const nsfwFilter = require("./nsfwFilter");
const imageService = require("./imageService");
const sanitizeMessageText = require("./sanitizeMessageText");
const removeListenerSafe = require("./removeListenerSafe");
const handleCharacterInteractionDataUpdate = require("./handleCharacterInteractionDataUpdate");
const handleImageGeneration = require("./handleImageGeneration");

const activeHandlers = {};

function writeJSON(res, data, isFinal) {
    res.write(`${JSON.stringify(data)}\n`);
    if (isFinal)
        res.end("<|endofstream|>");
}

class DataStreamHandler {
    constructor(dataStream, opts) {
        const { res, chat, characterId, userId, needsFiltering, poeInstance, userMessageText, log, isImageGenerating } = opts;

        activeHandlers[chat.id] = this;

        this.res = res;
        this.chat = chat;
        this.characterId = characterId;
        this.userId = userId;
        this.needsFiltering = needsFiltering;
        this.poeInstance = poeInstance;
        this.userMessageText = userMessageText;
        this.log = log;

        let selfMessageObject = {};
        let botMessageObject = {};

        let isFiltered = false;

        dataStream.on("selfMessage", messageData => {
            const { messageId } = messageData;
            
            const sanitizedMessageText = sanitizeMessageText(userMessageText);

            selfMessageObject = {
                id: db.getUniqueId(),
                authorType: "user",
                authorId: userId,
                timestamp: Date.now(),
                isFiltered: false,
                text: sanitizedMessageText,
                moods: []
            }

            writeJSON(this.res, { error: false, messageObject: selfMessageObject });

            selfMessageObject.poeId = messageId;
        });
        dataStream.on("messageUpdated", messageData => {
            if (needsFiltering && !isFiltered) {
                const filterResult = nsfwFilter(messageData);
                if (filterResult.isFiltered) {
                    isFiltered = true;
                    log.info("Response was filtered! Caught by:", filterResult.caughtBy);
                }
            }

            const moods = messageData.currentMoods;
            const rawMessageText = messageData.linkifiedText;
            const isBreakingCharacter = messageData.isBreakingCharacter;

            const sanitizedMessageText = sanitizeMessageText(rawMessageText);

            // update bot message data
            botMessageObject = {
                id: db.getUniqueId(),
                authorType: "ai",
                authorId: characterId,
                timestamp: Date.now(),
                isFiltered,
                text: isFiltered ? FILTERED_TEXT_PLACEHOLDER : sanitizedMessageText,
                moods: isFiltered ? [] : moods
            }

            let responseObj = { error: false, messageObject: botMessageObject }

            if (isBreakingCharacter) {
                responseObj.error = true;
                responseObj.message = "No character reply";
            }

            writeJSON(this.res, responseObj);
        });
        dataStream.once("error", errObj => {
            const { message, data: errorData } = errObj;

            log.error("Error occurred while inferencing: \"" + (message || errObj) + "\"\n");
            if (errorData)
                log.error(errorData);

            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "start-over");
            removeListenerSafe(dataStream, "messageUpdated");
            removeListenerSafe(dataStream, "messageComplete");
            removeListenerSafe(dataStream, "selfMessage");

            const responseObj = { error: true, message };

            writeJSON(this.res, responseObj, true);
        });
        dataStream.once("start-over", newDataStream => {
            log.warn("Inference failed first attempt, retrying a second time");

            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "start-over");
            removeListenerSafe(dataStream, "messageUpdated");
            removeListenerSafe(dataStream, "messageComplete");
            removeListenerSafe(dataStream, "selfMessage");

            /*res.write(`${JSON.stringify({ error: false, messageObject: {
                authorType: "ai",
                authorId: characterId,
                timestamp: Date.now(),
                isFiltered: false,
                text: "",
                moods: []
            } })}\n`);*/

            new DataStreamHandler(newDataStream, opts);
        });
        const handleMessageEnd = async (finalMessageData) => {
            // assign unique id to bot message
            botMessageObject.id = db.getUniqueId();
            log.info("Inference finished for character ID " + characterId + " @ chat ID " + chat.id);
            //  end req
            writeJSON(this.res, { error: false, messageObject: botMessageObject }, true);
            // call callback
            if (typeof this.doneCallback == "function")
                this.doneCallback(finalMessageData);
            // sanity check so we don't add filtered messages
            if (!isFiltered) {
                // download imgs
                let proxyBotMessage = {
                    ...botMessageObject
                };
                proxyBotMessage.poeId = finalMessageData.messageId;
                delete proxyBotMessage.isAwaitingImageGeneration;
                delete proxyBotMessage.imageGenerationETA;
                if (typeof botMessageObject.image == "object") {
                    let img = {};
                    img.prompt = botMessageObject.image.prompt;
                    const images = botMessageObject.image.imageCandidates;
                    if (typeof images == "object") {
                        img.imageCandidates = [];
                        for (const imageData of images) {
                            try {
                                const { fileName } = await imageService.handleDataUriUpload(imageData);
                                img.imageCandidates.push(fileName);
                            } catch(err) {
                                log.error("Failed to upload image", err);
                            }
                        }
                    }
                    proxyBotMessage.image = img;
                }
                // append chat history
                chat.addMessages([
                    selfMessageObject,
                    proxyBotMessage
                ]);
                log.info("Final messageObject:", proxyBotMessage);
                // handle char data updates (message count, etc.)
                handleCharacterInteractionDataUpdate(characterId);
            } else {
                log.debug("Deleting filtered interaction");
                poeInstance.deleteMessage(selfMessageObject.poeId, botMessageObject.poeId);
            }
        }
        dataStream.once("messageComplete", async finalMessageData => {
            // log completion
            log.info("Inference complete");
            // clear event listeners
            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "start-over");
            removeListenerSafe(dataStream, "messageUpdated");
            removeListenerSafe(dataStream, "messageComplete");
            removeListenerSafe(dataStream, "selfMessage");
            // handle image generationg if needed
            if (isImageGenerating && (typeof finalMessageData.imagePrompt == "string")) {
                botMessageObject.isAwaitingImageGeneration = true;
                writeJSON(this.res, { error: false, messageObject: botMessageObject });
                const imageStream = handleImageGeneration(finalMessageData);
                imageStream.on("etaUpdate", estimationData => {
                    const { eta } = estimationData;
                    botMessageObject.imageGenerationETA = eta;
                    botMessageObject.isAwaitingImageGeneration = true;
                    writeJSON(this.res, { error: false, messageObject: botMessageObject });
                });
                imageStream.on("error", err => {
                    botMessageObject.isAwaitingImageGeneration = false;
                    log.error("Failed to generate image:", err);
                    botMessageObject.image = { error: err };
                    handleMessageEnd(finalMessageData);
                });
                imageStream.on("imageDone", image => {
                    botMessageObject.image = image;
                    botMessageObject.selectedImageIndex = 0;
                    //log.info("Image ready:", image);
                    botMessageObject.isAwaitingImageGeneration = false;
                    handleMessageEnd(finalMessageData);
                });
            } else {
                // run finals
                handleMessageEnd(finalMessageData);
            }
        });
    }

    done(callback) {
        this.doneCallback = callback;
    }
}

module.exports = {
    handleDataStream(dataStream, opts) {
        return new DataStreamHandler(dataStream, opts)
    },
    getOpenHandler(chatId) {
        return activeHandlers[chatId];
    }
}