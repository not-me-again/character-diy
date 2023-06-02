module.exports = {
    method: "GET",
    path: "/api/characters/:characterId/info",
    async callback(req, res) {
        const character = req.character;
        
        let characterData = { ...character.getObject() };

        if (!req.isCharacterOwner) {
            delete characterData.personalityPrompt;
            delete characterData.exampleConvo;
        }
        
        res.status(200).send({ success: true, characterData });
    }
}