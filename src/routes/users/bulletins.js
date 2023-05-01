const CONFIG = require("../../../config.json");

module.exports = {
    method: "GET",
    path: "/api/bulletins",
    async callback(req, res) {
        const { user } = req.auth;
        if (!user)
            return res.status(401).send({ success: false, error: "unauthenticated" });

        const bulletins = CONFIG.BULLETINS;

        res.status(200).send({ success: true, bulletins });
    }
}