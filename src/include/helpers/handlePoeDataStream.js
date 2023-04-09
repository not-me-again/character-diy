const { FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");
const db = require("../db");
const nsfwFilter = require("./nsfwFilter");
const sanitizeMessageText = require("./sanitizeMessageText");
const removeListenerSafe = require("./removeListenerSafe");
const handleCharacterInteractionDataUpdate = require("./handleCharacterInteractionDataUpdate");

const activeHandlers = {};

class DataStreamHandler {
    constructor(dataStream, opts) {
        const { res, chat, characterId, userId, needsFiltering, poeInstance, userMessageText, log } = opts;

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

            this.res.write(`${JSON.stringify({ error: false, messageObject: selfMessageObject })}\n`);

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

            this.res.write(`${JSON.stringify(responseObj)}\n`);
        });
        dataStream.once("error", errObj => {
            const { message, data: errorData } = errObj;

            log.error("Error occurred while inferencing: \"" + message + "\"\n", errorData);

            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "start-over");
            removeListenerSafe(dataStream, "messageUpdated");
            removeListenerSafe(dataStream, "messageComplete");
            removeListenerSafe(dataStream, "selfMessage");

            const responseObj = { error: true, message };

            this.res.end(`${JSON.stringify(responseObj)}\n`);
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
        dataStream.once("messageComplete", finalMessageData => {
            // log completion
            log.info("Inference complete");
            // clear event listeners
            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "start-over");
            removeListenerSafe(dataStream, "messageUpdated");
            removeListenerSafe(dataStream, "messageComplete");
            removeListenerSafe(dataStream, "selfMessage");
            // sanity check so we don't add filtered messages
            if (!isFiltered) {
                // assign unique id to bot message
                botMessageObject.id = db.getUniqueId();
                botMessageObject.poeId = finalMessageData.messageId;
                // append chat history
                chat.addMessages([ selfMessageObject, botMessageObject ]);
                // handle char data updates (message count, etc.)
                handleCharacterInteractionDataUpdate(characterId);
            } else {
                log.debug("Deleting filtered interaction");
                poeInstance.deleteMessage(selfMessageObject.poeId, botMessageObject.poeId);
            }
            //  end req
            this.res.end("<|endofstream|>");
        });
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