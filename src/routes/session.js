const config = require("../../config.json");

module.exports = {
    method: "GET",
    path: "/api/session",
    async callback(req, res) {
        const { apiKey, user, raw: rawApiKey } = req.auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });

        let setHeaders = {
            "Content-Type": "application/json"
        };

        const { cookies } = req;
        if (cookies.session != rawApiKey)
            setHeaders["set-cookie"] = `session=${rawApiKey}; path=/; expires=Never;`;
        
        let userObj = { ...user.getObject() }

        userObj.quotas = {
            maxAllowedChats: config.MAX_ALLOWED_CHATS_PER_USER,
            maxAllowedCharacters: config.MAX_ALLOWED_CHARS_PER_USER,
            dailyMessageLimit: config.DAILY_MESSAGE_LIMIT
        }

        res.writeHead(200, setHeaders);
        res.end(JSON.stringify({ success: true, user: userObj }));
    }
}