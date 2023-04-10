module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/publish",
    async callback(req, res) {
        const chat = req.chat;
        if (!chat)
            return res.status(400).send({ success: false, error: "preflight_failure0" });
        const { user } = req.auth;
        if (!user)
            return res.status(400).send({ success: false, error: "preflight_failure1" });

        const { isPublic } = req.body;

        const userDisplayName = await user.get("displayName");
        const charData = await chat.get("cachedCharacterData");
        const botDisplayName = (typeof charData == "object") ? charData.displayName : "AI";
        const title = `${userDisplayName}'s chat with ${botDisplayName}`;

        const savedChat = await chat.createSavedChat();
        await savedChat.set({
            name: title,
            isPublic
        });
        await savedChat.save();

        const savedChatId = await savedChat.get("id");

        res.status(200).send({ success: true, savedChatId });
    }
}