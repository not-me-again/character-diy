module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/edit",
    async callback(req, res) {
        const chat = req.chat;

        const { displayName } = req.body;

        if ((typeof displayName == "string") && (displayName.length > 0))
            await chat.set("name", displayName);

        res.status(200).send({ success: true });
    }
}