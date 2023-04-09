const { BACKEND_CONVERSION } = require("../../../config.json");
const db = require("../../include/db");
const cache = require("../../include/cache");

module.exports = {
    method: "GET",
    path: "/api/popularCharacters",
    async callback(req, res) {
        let charObjs = cache.getPopularCharacters();
        let chars = [];
        for (const charObj in charObjs) {
            let characterData = { ...charObj };
            
            const currentBackend = characterData.backend;
            if (typeof currentBackend == "string") {
                const newBackend = Object.entries(BACKEND_CONVERSION)?.find(e => e[1] == currentBackend);
                characterData.backend = (newBackend && (newBackend.length >= 2)) ? newBackend[0] : undefined;
            }

            chars.push(characterData);
        }

        res.status(200).send({ success: true, chars });
    }
}