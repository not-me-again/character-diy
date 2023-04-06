const { AGE_OF_MAJORITY_MS, FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");

const { Logger, colors } = require("../../include/logging");
const nsfwFilter = require("../../include/helpers/nsfwFilter");
const sanitizeMessageText = require("../../include/helpers/sanitizeMessageText");
const removeListenerSafe = require("../../include/helpers/removeListenerSafe");
const cache = require("../../include/cache");
const db = require("../../include/db");

const log = new Logger("InferenceAPI");

function handlePoeDataStream(dataStream, opts) {
    const { res, chat, characterId, userId, needsFiltering, poeInstance, userMessageText } = opts;
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

        res.write(`${JSON.stringify({ error: false, messageObject: selfMessageObject })}\n`);

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

        res.write(`${JSON.stringify(responseObj)}\n`);
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

        res.end(`${JSON.stringify(responseObj)}\n`);
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

        handlePoeDataStream(newDataStream, opts);
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
        } else {
            log.debug("Deleting filtered interaction");
            poeInstance.deleteMessage(selfMessageObject.poeId, botMessageObject.poeId);
        }
        //  end req
        res.end("<|endofstream|>");
    });
}

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/inference",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");

        const chat = req.chat;
        if (!chat)
            return res.status(500).send({ success: false, error: "preflight_condition2_failure" });

        const { text: rawUserMessageText } = req.body;
        if (typeof rawUserMessageText != "string")
            return res.status(400).send({ success: false, error: "message_blank" });
        
        const userMessageText = rawUserMessageText.trim();
        if (userMessageText.length <= 0)
            return res.status(400).send({ success: false, error: "message_emtpy" });
            
        const characterId = await chat.get("activeCharacterId");
        log.info("Inferencing for character ID " + characterId);

        const character = db.getCharacter(characterId);
        if (!await character.exists())
            return res.status(500).send({ success: false, error: "preflight_condition3_failure" });
        
        const filterEnabled = await chat.get("isFilterEnabled");
        const userBirthdate = await user.get("birthdate");
        const needsFiltering = filterEnabled || typeof userBirthdate != "number" || ((Date.now() - userBirthdate) < AGE_OF_MAJORITY_MS);
        log.info("User needs filter");

        let characterTotalMessages = await character.get("totalMessageCount");

        res.writeHead(200, { "Content-Type": "application/json" });
        
        let poeInstance = await cache.getPoeInstance(userId);
        if (!poeInstance) {
            const authCookie = await chat.get("poeCookie");
            if (!authCookie || !characterId)
                return res.status(500).send({ success: false, error: "preflight_condition4_failure" });
            
            let backend = await character.get("backend");
            if (!backend)
                backend = "claude";

            poeInstance = await cache.newPoeInstance(userId, authCookie, backend);
        }

        const dataStream = poeInstance.sendMessage(userMessageText);
        handlePoeDataStream(dataStream, { chat, poeInstance, res, characterId, userMessageText, userId, characterTotalMessages, needsFiltering });
        
        // update total messages sent by character
        if (typeof characterTotalMessages != "number")
            characterTotalMessages = 0;

        await character.set("totalMessageCount", characterTotalMessages++);
        if (characterTotalMessages % 6 == 0)
            await character.save();
    }
}