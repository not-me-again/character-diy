const { getQuotasForUserId } = require("../include/helpers/quotaManager");

module.exports = {
    method: "GET",
    path: "/api/session",
    async callback(req, res) {
        const { apiKey, user, raw: rawApiKey } = req.auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });

        const userId = await user.get("id");

        let setHeaders = {
            "Content-Type": "application/json"
        };

        const { cookies } = req;
        if (cookies.session != rawApiKey)
            setHeaders["set-cookie"] = `session=${rawApiKey}; path=/; expires=Never;`;
        
        let userObj = { ...user.getObject() }

        const quotas = await getQuotasForUserId(userId);

        userObj.quotas = {
            maxAllowedChats: quotas.MAX_ALLOWED_CHATS_PER_USER,
            maxAllowedCharacters: quotas.MAX_ALLOWED_CHARS_PER_USER,
            dailyMessageLimit: quotas.DAILY_MESSAGE_LIMIT,
            chatHistoryLimit: quotas.MAX_CHAT_HISTORY_LENGTH
        }

        delete userObj.apiKeys;

        res.writeHead(200, setHeaders);
        res.end(JSON.stringify({ success: true, user: userObj }));
    }
}