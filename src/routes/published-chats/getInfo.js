const db = require("../../include/db");

module.exports = {
    paths: [
        {
            path: "/api/archive/:savedChatId/info",
            method: "GET"
        }
    ],
    async callback(req, res) {
        let user;
        if (typeof req.auth == "object")
            user = req.auth.user;

        const { savedChatId } = req.params;
        const savedChat = await db.getSavedChat(savedChatId);
        if (!await savedChat.exists())
            return res.status(404).send({ success: false, error: "archive_not_found" });
        const isPublic = await savedChat.get("isPublic");
        const ownerId = await savedChat.get("ownerId");
        if (!isPublic) {
            if ((typeof user == "object") && (await user.exists())) {
                if ((await user.get("id")) != ownerId)
                    return res.status(403).send({ success: false, error: "unauthorized" });
            } else {
                return res.status(401).send({ success: false, error: "unauthenticated" });
            }
        }

        const activeCharacterId = await savedChat.get("activeCharacterId");
        const messages = await savedChat.get("messages");
        let cachedCharacterData = await savedChat.get("cachedCharacterData");

        delete cachedCharacterData.backend;
        delete cachedCharacterData.startMessage;
        delete cachedCharacterData.personalityPrompt;
        delete cachedCharacterData.exampleConvo;

        res.status(200).send({
            success: true,
            chatData: {
                messages,
                ownerId,
                cachedCharacterData,
                activeCharacterId,
                cachedUserData: await savedChat.get("cachedUserData")
            }
        });
    }
}