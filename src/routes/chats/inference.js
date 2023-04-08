const { AGE_OF_MAJORITY_MS, FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");

const { Logger, colors } = require("../../include/logging");
const cache = require("../../include/cache");
const { handleDataStream } = require("../../include/helpers/handlePoeDataStream");

const log = new Logger("InferenceAPI");

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
            
        const characterId = await chat.get("activeCharacterId");
        log.info("Inferencing for character ID " + characterId);

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
                authCookie = await signupHandler().catch(console.error);
                await chat.set("poeCookie", authCookie);
            }

            if (!characterId)
                return res.status(500).send({ success: false, error: "preflight_condition4_failure" });
            
            let backend = charData["backend"];
            if (!backend)
                backend = "claude";

            poeInstance = await cache.newPoeInstance(chatId, authCookie, backend);
        } else if (poeInstance.isReplying)
            return res.status(400).send({ success: false, error: "previous_inference_incomplete" });

        res.writeHead(200, { "Content-Type": "application/json" });

        const dataStream = poeInstance.sendMessage(userMessageText);
        handleDataStream(dataStream, { chat, poeInstance, res, characterId, userMessageText, userId, needsFiltering, log });
    }
}