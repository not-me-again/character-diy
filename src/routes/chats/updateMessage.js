module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/updateMessage",
    async callback(req, res) {
        const { messageId, properties } = req.body;
        if (typeof messageId != "string")
            return res.status(400).send({ success: false, error: "empty_message_id" });
        if (typeof properties != "object")
            return res.status(400).send({ success: false, error: "empty_properties" });

        const chat = req.chat;

        let messages = await chat.get("messages");
        if (!messages || (messages.length <= 0))
            return res.status(500).send({ success: false, error: "preflight_check_failed" });
        
        const messageIndex = messages.findIndex(m => m.id == messageId);
        if (messageIndex < 0)
            return res.status(404).send({ success: false, error: "message_not_found" });

        let message = messages[messageIndex];
        if (typeof message != "object")
            return res.status(404).send({ success: false, error: "message_not_found" });

        const { selectedImageIndex } = properties;
        if (typeof selectedImageIndex == "number")
            message.selectedImageIndex = selectedImageIndex;
        
        await chat.set("messages", messages);
        await chat.save();

        res.status(200).send({ success: true });
    }
}