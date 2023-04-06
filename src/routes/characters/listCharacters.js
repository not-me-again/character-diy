const db = require("../../include/db");

module.exports = {
    method: "GET",
    path: "/api/characters",
    async callback(req, res) {
        const { user } = req.auth;
        
        let charIds = await user.get("characters");
        if (typeof charIds != "object")
            return res.status(500).end({ success: false, error: "preflight_condition_failure" });

        let chars = [];
        for (const charId of charIds) {
            const charObj = db.getCharacter(charId);
            await charObj.load();
            chars.push(charObj.getObject());
        }
    
        res.status(200).send({ success: true, chars });
    }
}