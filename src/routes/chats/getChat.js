const resetChatContext = require("../../include/helpers/resetChatContext");

module.exports = {
    method: "GET",
    path: "/api/chats/:chatId/info",
    async callback(req, res) {
        const chat = req.chat;

        const messages = await chat.get("messages");
        if (!messages || (messages.length <= 0))
            await resetChatContext(chat);
        
        let chatData = { ...chat.getObject() };

        delete chatData.poeCookie;
        delete chatData.poeChatId;

        chatData.messages = [];

        for (let message of messages)
            if (typeof message == "object") {
                const copyMessage = { ...message };
                delete copyMessage.poeId;
                chatData.messages.push(copyMessage);
            }

        res.status(200).send({ success: true, chatData });
    }
}