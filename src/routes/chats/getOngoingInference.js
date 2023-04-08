const { getOpenHandler } = require("../../include/helpers/handlePoeDataStream");

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/ongoing",
    async callback(req, res) {
        const { user } = req.auth;

        const chat = req.chat;
        if (!chat)
            return res.status(500).send({ success: false, error: "preflight_condition2_failure" });
        const chatId = await chat.get("id");

        const ongoingInference = getOpenHandler(chatId);
        if (!ongoingInference)
            return res.status(404).send({ success: false, error: "no_ongoing_inference" });

        res.writeHead(200, { "Content-Type": "application/json" });
        ongoingInference.res = res;
    }
}