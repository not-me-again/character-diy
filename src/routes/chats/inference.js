const { AGE_OF_MAJORITY_MS, FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");

const { Logger, colors } = require("../../include/logging");
const cache = require("../../include/cache");
const { handleDataStream } = require("../../include/helpers/handlePoeDataStream");
const db = require("../../include/db");
const { Poe } = require("../../include/poe");

const log = new Logger("InferenceAPI");
const poeCookieStore = db.getPoeCookieStore();

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/inference",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");

        const chat = req.chat;
        if (!chat)
            return res.status(500).send({ success: false, error: "preflight_condition2_failure" });
        const chatId = await chat.get("id");

        const { text: rawUserMessageText } = req.body;
        if (typeof rawUserMessageText != "string")
            return res.status(400).send({ success: false, error: "message_blank" });
        
        const userMessageText = rawUserMessageText.trim();
        if (userMessageText.length <= 0)
            return res.status(400).send({ success: false, error: "message_emtpy" });

        if (userMessageText.length >= 10_000)
            return res.status(400).send({ success: false, error: "too_many_tokens" });
            
        const characterId = await chat.get("activeCharacterId");
        log.info("Inferencing for character ID " + characterId + " @ chat ID " + chatId);

        const cachedCharacter = await chat.getCharacterData();
        if (!cachedCharacter)
            return res.status(500).send({ success: false, error: "no_cached_character" });

        const charData = {
            backend: cachedCharacter["backend"],
            startMessage: cachedCharacter["startMessage"],
            personalityPrompt: cachedCharacter["personalityPrompt"],
            exampleConvo: cachedCharacter["exampleConvo"],
            blurb: cachedCharacter["blurb"],
            pronouns: cachedCharacter["pronouns"],
            name: cachedCharacter["displayName"]
        }
        
        const filterEnabled = await chat.get("isFilterEnabled");
        const userBirthdate = await user.get("birthdate");
        const needsFiltering = filterEnabled || typeof userBirthdate != "number" || ((Date.now() - userBirthdate) < AGE_OF_MAJORITY_MS);

        if (needsFiltering)
            log.info("User needs filter");
        
        let poeInstance = await cache.getPoeInstance(chatId);
        if (!poeInstance) {
            let authCookie = await chat.get("poeCookie");
            if ((typeof authCookie != "string") || (authCookie.length <= 0)) {
                authCookie = await poeCookieStore.allocateCookieForChat(chatId);
                await chat.set("poeCookie", authCookie);
            }

            let poeChatId = await chat.get("poeChatId");
            if ((typeof poeChatId != "number") || (poeChatId <= 0)) {
                poeChatId = await Poe.createChat(authCookie);
                await chat.set("poeChatId", poeChatId);
            }

            if (!characterId)
                return res.status(500).send({ success: false, error: "preflight_condition4_failure" });
            
            let backend = charData["backend"];
            if (!backend)
                backend = "claude";

            poeInstance = await cache.newPoeInstance(chatId, authCookie, backend, poeChatId);
        } else if (poeInstance.isReplying)
            return res.status(400).send({ success: false, error: "previous_inference_incomplete" });

        res.writeHead(200, { "Content-Type": "application/json" });

        const dataStream = poeInstance.sendMessage(userMessageText);
        handleDataStream(dataStream, { chat, poeInstance, res, characterId, userMessageText, userId, needsFiltering, log });
    }
}