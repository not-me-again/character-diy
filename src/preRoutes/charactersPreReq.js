const db = require("../include/db");

module.exports = {
    paths: [
        "/api/characters/:characterId/*"
    ],
    method: "ANY",
    async callback(req, res, next) {
        const { auth } = req;
        if (!auth)
            return res.status(401).send({ success: false, error: "unauthenticated" });
        const { apiKey, user } = auth;
        if (!apiKey || !user)
            return res.status(401).send({ success: false, error: "unauthenticated" });
        
        const { characterId } = req.params;

        const character = db.getCharacter(characterId);
        if (!await character.exists())
            return res.status(404).send({ success: false, error: "unknown_character" });

        const userId = await user.get("id");
        const authorId = await character.get("authorId");
        const isOwner = authorId == userId;
        const isPublic = await character.get("isPublic");

        if (!isPublic && !isOwner)
            return res.status(403).send({ success: false, error: "unauthorized" });

        req.character = character;
        req.isCharacterOwner = isOwner;

        next();
    }
};