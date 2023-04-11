const cache = require("../../include/cache");

module.exports = {
    method: "POST",
    path: "/api/characters/:characterId/delete",
    async callback(req, res) {
        const { character, isCharacterOwner } = req;
        if (!isCharacterOwner)
            return res.status(403).send({ success: false, error: "unauthorized" });

        const id = await character.get("id");
        cache.removePopularCharacterById(id);

        await character.delete();

        res.status(200).send({ success: true });
    }
}