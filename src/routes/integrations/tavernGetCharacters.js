const axios = require("axios");

module.exports = {
    method: "GET",
    path: "/api/integrations/getTavernCharacters",
    async callback(req, res) {
        let reqURL = "https://tavernai.net/characters/";

        const { search } = req.query;
        if (typeof search == "string")
            reqURL += `?q=${search}`;

        let chars = [];

        const tavernReq = await axios({
            url: reqURL,
            method: "GET",
            validateStatus: () => true
        });
        if (tavernReq.status != 200)
            return res.status(400).send({ success: false, error: "preflight_failure0" });

        if (typeof tavernReq.data != "object")
            return res.status(400).send({ success: false, error: "preflight_failure1" });

        for (const [tagName, characters] of Object.entries(tavernReq.data)) {
            for (const tavernCharacter of characters) {
                const {
                    public_id,
                    name,
                    short_description,
                    deleted,
                    create_date,
                    edit_date
                } = tavernCharacter;

                if ((typeof deleted != "number") || (deleted > 0))
                    continue;

                let createdAt = Date.now();
                if (typeof create_date == "string")
                    createdAt = new Date(create_date);
                let updatedAt = Date.now();
                if (typeof edit_date == "string")
                    updatedAt = new Date(edit_date);

                chars.push({
                    charaId: public_id,
                    avatarURL: `/image/chara/${public_id}.webp`,
                    displayName: name,
                    tags: [ tagName.toLowerCase().replace(" ", "_") ],
                    blurb: short_description,
                    createdAt: createdAt.getTime(),
                    updatedAt: updatedAt.getTime()
                });
            }
        }

        res.status(200).send({ success: true, chars });
    }
}