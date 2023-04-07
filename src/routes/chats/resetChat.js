const resetChatContext = require("../../include/helpers/resetChatContext");
const db = require("../../include/db");

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/reset",
    async callback(req, res) {
        const { user } = req.auth;
        const chat = req.chat;

        const characterId = await chat.get("activeCharacterId");
        if (!characterId)
            return res.status(400).send({ success: false, error: "no_character_id" });

        const character = db.getCharacter(characterId);
        if (!await character.exists())
            return res.status(400).send({ success: false, error: "unknown_character_id" });
        
        const userId = await user.get("id");
        
        const isPublicCharacter = await character.get("isPublic");
        const characterCreatorId = await character.get("authorId");
        if (!isPublicCharacter && (characterCreatorId != userId))
            return res.status(403).send({ success: false, error: "not_authorized" });
        
        let name = await character.get("displayName");
        let thumbnailURL = await character.get("avatarURL");
        
        await chat.set({
            updatedAt: Date.now(),
            name,
            messages: [],
            messageCount: 0,
            thumbnailURL
        });
        await chat.save();

        try {
            await resetChatContext(chat);
        } catch(err) {
            console.error(err);
            return res.status(500).send({ success: false, error: err.toString() });
        }

        res.status(200).send({ success: true });
    }
}