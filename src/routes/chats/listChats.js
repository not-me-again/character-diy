const db = require("../../include/db");

module.exports = {
    method: "GET",
    path: "/api/chats",
    async callback(req, res) {
        const { apiKey, user } = req.auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });
        
        let chatIds = await user.get("chats");
        if (typeof chatIds != "object")
            return res.status(500).send({ success: false, error: "preflight_condition_failure" });

        let chats = [];
        for (const chatId of chatIds) {
            const chatObj = db.getChat(chatId);
            if (!await chatObj.exists())
                continue;

            let chatData = { ...chatObj.getObject() };

            delete chatData.backend;
            delete chatData.cachedCharacterData;
            delete chatData.messages;
            delete chatData.poeCookie;
            delete chatData.poeChatId;

            chats.push(chatData);
        }
    
        res.status(200).send({ success: true, chats });
    }
}