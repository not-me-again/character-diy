const cache = require("../../include/cache");
const db = require("../../include/db");

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/deleteMessage",
    async callback(req, res) {
        const chat = req.chat;

        const chatId = await chat.get("id");
        
        const activeCharacterId = await chat.get("activeCharacterId");
        const character = db.getCharacter(activeCharacterId);
        if (!await character.exists())
            return res.status(500).send({ success: false, error: "no_character" });

        const { messageId } = req.body;
        if (typeof messageId != "string")
            return res.status(400).send({ success: false, error: "empty_message_id" });

        let messages = await chat.get("messages");
        if (!messages || (messages.length <= 0))
            return res.status(500).send({ success: false, error: "preflight_check_failed" });
        
        let messageIndex = messages.findIndex(m => m.id == messageId);
        if (messageIndex < 0)
            return res.status(404).send({ success: false, error: "message_not_found" });

        messages.splice(0, messageIndex + 1);
        await chat.set("messages", messages);
        await chat.save();

        res.status(200).send({ success: true });
    }
}