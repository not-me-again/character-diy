module.exports = {
    method: "GET",
    path: "/api/characters/:characterId/info",
    async callback(req, res) {
        const character = req.character;
        
        let characterData = { ...character.getObject() };
        res.status(200).send({ success: true, characterData });
    }
}