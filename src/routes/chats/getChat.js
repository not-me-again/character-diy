const resetChatContext = require("../../include/helpers/resetChatContext");

module.exports = {
    method: "GET",
    path: "/api/chats/:chatId/info",
    async callback(req, res) {
        const { user } = req.auth;
        const chat = req.chat;

        const messages = await chat.get("messages");
        if (!messages || (messages.length <= 0))
            try {
                await resetChatContext(chat);
            } catch(err) {
                console.error(err);
                return res.status(500).send({ success: false, error: err.toString() });
            }
        
        let chatData = { ...chat.getObject() };

        delete chatData.poeCookie;
        delete chatData.poeChatId;

        let cachedCharacterData = { ...chatData.cachedCharacterData };

        const chatOwner = await chat.get("ownerId");
        const userId = await user.get("id");
        if (chatOwner != userId) {
            delete cachedCharacterData.personalityPrompt;
            delete cachedCharacterData.pronouns;
            delete cachedCharacterData.exampleConvo;
            delete cachedCharacterData.backend;
        }

        chatData.cachedCharacterData = cachedCharacterData;

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