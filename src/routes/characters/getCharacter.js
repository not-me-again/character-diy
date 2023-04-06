const { BACKEND_CONVERSION } = require("../../../config.json");

module.exports = {
    method: "GET",
    path: "/api/characters/:characterId/info",
    async callback(req, res) {
        const character = req.character;
        
        let characterData = { ...character.getObject() };

        const currentBackend = characterData.backend;
        if (typeof currentBackend == "string")
            characterData.backend = Object.entries(BACKEND_CONVERSION)?.find(e => e[1] == currentBackend);
        
        res.status(200).send({ success: true, characterData });
    }
}