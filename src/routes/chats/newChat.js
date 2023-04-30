const { getQuotasForUserId } = require("../../include/helpers/quotaManager");
const signupHandler = require("../../include/helpers/signupHandler");
const resetChatContext = require("../../include/helpers/resetChatContext");
const db = require("../../include/db");

const { AGE_OF_MAJORITY_MS } = require("../../../config.json");

const poeCookieStore = db.getPoeCookieStore();

module.exports = {
    method: "POST",
    path: "/api/createChat",
    async callback(req, res) {
        const { apiKey, user } = req.auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });

        const userId = await user.get("id");

        const { characterId } = req.body;
        if (!characterId)
            return res.status(400).send({ success: false, error: "empty_character" });

        let activeCharacterId = "";
        let name = "";
        let thumbnailURL = "";
        const character = await db.getCharacter(characterId);
        if (await character.exists()) {
            const isPublicCharacter = await character.get("isPublic");
            const characterCreatorId = await character.get("authorId");
            if (!isPublicCharacter && (characterCreatorId != userId))
                return res.status(403).send({ success: false, error: "not_authorized" });
            
            activeCharacterId = characterId;
            name = await character.get("displayName");
            thumbnailURL = await character.get("avatarURL");
        } else
            return res.status(404).send({ success: false, error: "character_not_found" });
        
        const { MAX_ALLOWED_CHATS_PER_USER } = await getQuotasForUserId(userId);

        let chats = await user.get("chats");
        if (chats.length >= MAX_ALLOWED_CHATS_PER_USER)
            return res.status(403).send({ success: false, error: "chat_limit_reached" });

        let nameIteration = 0;
        for (const chatId of chats) {
            const chat = db.getChat(chatId);
            if (!await chat.exists())
                continue;
            const chatName = await chat.get("name");
            if ((typeof chatName == "string") && (chatName.toLowerCase() == name.toLowerCase()))
                nameIteration++;
        }
        if (nameIteration > 0)
            name = name + ` (${nameIteration + 1})`;

        const newChatId = db.getUniqueId();

        const poeCookie = await poeCookieStore.allocateCookieForChat(newChatId);
        if (typeof poeCookie != "string")
            res.status(500).send({ success: false, error: "preflight_failure0" });

        const birthdate = await user.get("birthdate");
        const needsFilterEnabled = typeof birthdate != "number" || ((Date.now() - birthdate) < AGE_OF_MAJORITY_MS);
        
        let cachedCharacterData = {
            backend: await character.get("backend"),
            startMessage: await character.get("startMessage"),
            personalityPrompt: await character.get("personalityPrompt"),
            blurb: await character.get("blurb"),
            pronouns: await character.get("pronouns"),
            exampleConvo: await character.get("exampleConvo"),
            avatarURL: await character.get("avatarURL"),
            displayName: await character.get("displayName")
        };

        const newChat = db.getChat(newChatId);
        await newChat.set({
            createdAt: Date.now(),
            updatedAt: Date.now(),
            poeCookie,
            ownerId: userId,
            activeCharacterId,
            name,
            thumbnailURL,
            isFilterEnabled: needsFilterEnabled,
            cachedCharacterData
        });
        await newChat.save();

        chats.push(newChat.id);
        await user.set("chats", chats);
        await user.save();

        try {
            await resetChatContext(newChat);
        } catch(err) {
            console.error(err);
            return res.status(500).send({ success: false, error: err.toString() });
        }

        const newChatData = { ...newChat.getObject() };

        delete newChatData.poeCookie;
        delete newChatData.poeChatId;
        
        res.status(200).send({ success: true, chat: newChatData });
    }
}