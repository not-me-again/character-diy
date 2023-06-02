const db = require("../../include/db");

module.exports = {
    method: "GET",
    path: "/api/characters",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");
        
        let charIds = await user.get("characters");
        if (typeof charIds != "object")
            return res.status(500).send({ success: false, error: "preflight_condition_failure" });

        let isSaved = false;

        let chars = [];
        for (const i in charIds) {
            const charId = charIds[i];
            const charObj = db.getCharacter(charId);
            await charObj.load();

            if ((!await charObj.exists()) || (await charObj.get("authorId") != userId)) {
                charIds.splice(i, 1);
                isSaved = true;
                continue;
            }
            
            let characterData = { ...charObj.getObject() };

            chars.push(characterData);
        }

        if (isSaved) {
            await user.set("characters", charIds);
            await user.save();
        }

        res.status(200).send({ success: true, chars });
    }
}