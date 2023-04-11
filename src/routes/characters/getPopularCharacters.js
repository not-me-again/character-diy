const { BACKEND_CONVERSION } = require("../../../config.json");
const db = require("../../include/db");
const cache = require("../../include/cache");

module.exports = {
    method: "GET",
    path: "/api/popularCharacters",
    async callback(req, res) {
        let charObjs = cache.getPopularCharacters();

        let chars = [];
        
        for (const idx in charObjs) {
            const charObj = charObjs[idx];

            let backend = "claude";
            const currentBackend = charObj.backend;
            if (typeof currentBackend == "string") {
                const newBackend = Object.entries(BACKEND_CONVERSION)?.find(e => e[1] == currentBackend);
                backend = (newBackend && (newBackend.length >= 2)) ? newBackend[0] : undefined;
            }

            chars.push({
                backend,
                id: charObj.id,
                authorId: charObj.authorId,
                avatarURL: charObj.avatarURL,
                displayName: charObj.displayName,
                tags: charObj.tags,
                blurb: charObj.blurb,
                totalMessageCount: charObj.totalMessageCount,
                monthlyActiveUsers: charObj.monthlyActiveUsers,
                views: charObj.views,
                createdAt: charObj.createdAt,
                updatedAt: charObj.updatedAt
            });
        }

        res.status(200).send({ success: true, chars });
    }
}