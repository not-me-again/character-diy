const { BACKEND_CONVERSION } = require("../../../config.json");
const db = require("../../include/db");

module.exports = {
    method: "GET",
    path: "/api/characters",
    async callback(req, res) {
        const { user } = req.auth;
        
        let charIds = await user.get("characters");
        if (typeof charIds != "object")
            return res.status(500).send({ success: false, error: "preflight_condition_failure" });

        let chars = [];
        for (const charId of charIds) {
            const charObj = db.getCharacter(charId);
            await charObj.load();
            
            let characterData = { ...charObj.getObject() };
            
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