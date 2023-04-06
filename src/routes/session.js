const config = require("../../config.json");

module.exports = {
    method: "GET",
    path: "/api/session",
    async callback(req, res) {
        const { apiKey, user } = req.auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });
        
        let userObj = { ...user.getObject() }

        userObj.quotas = {
            maxAllowedChats: config.MAX_ALLOWED_CHATS_PER_USER,
            maxAllowedCharacters: config.MAX_ALLOWED_CHARS_PER_USER
        }

        res.status(200).send({ success: true, user: userObj });
    }
}