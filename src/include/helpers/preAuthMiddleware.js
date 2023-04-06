const db = require("../db");
const cache = require("../cache");

async function preAuthMiddleware(req, res, next) {
    const { authorization } = req.headers;

    let auth = {};
    if (typeof authorization == "string") {
        auth.raw = authorization;

        const apiKey = db.getAPIKey(authorization);
        auth.apiKey = apiKey;

        const userId = await apiKey.get("userId");

        if (typeof userId == "string") {
            //auth.poeInstance = cache.getPoeInstance(userId);

            const user = db.getUser(userId);

            if (!await user.exists())
                return res.status(400).send({ success: false, error: "user_not_found" });

            auth.user = user;
        }
    }

    req.auth = auth;
    next();
}

function authRequiredHandler(req, res, next) {
    if (!req || !req.auth || !req.auth.session)
        res.status(401).end("Authentication required");
    else
        next();
}

module.exports = { preAuthMiddleware, authRequiredHandler }