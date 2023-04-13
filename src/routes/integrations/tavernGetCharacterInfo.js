const { PRONOUN_CONVERSION } = require("../../../config.json");

const { charaRead: getCharaData, parseCharaFields } = require("../../include/helpers/importChara");
const { handleImageURLUpload } = require("../../include/helpers/imageService");

function getPronouns(str) {
    let pronouns = PRONOUN_CONVERSION["they/them/their"];

    if (str.match(/(she|her|hers)/))
        pronouns = PRONOUN_CONVERSION["she/her/her"];
    else if (str.match(/(he|him|his)/))
        pronouns = PRONOUN_CONVERSION["he/him/his"];
    else if (str.match(/(it|its)/))
        pronouns = PRONOUN_CONVERSION["it/it/its"];

    return pronouns;
}

module.exports = {
    method: "GET",
    path: "/api/integrations/getTavernCharacterInfo/:charaId",
    async callback(req, res) {
        const { charaId } = req.params;
        if (typeof charaId != "string")
            return res.status(400).send({ success: false, error: "preflight_failure0" });

        const charObjUrl = `https://tavernai.net/cards/${charaId}.webp`;
        let charaData = await getCharaData(charObjUrl);
        if (typeof charaData != "object")
            return res.status(404).send({ success: false, error: "chara_not_found" });

        const {
            name: displayName,
            description,
            first_mes,
            mes_example,
            personality: blurb
        } = charaData;

        let returnData = {
            displayName,
            blurb,
            backend: "claude",
            isPublic: false
        };

        if (description.match(/\w+\((\"|\')\w+/mi)) {
            const {
                backstory,
                personality,
                body,
                clothing,
                sexual_orientation,
                likes,
                dislikes,
                quirks
            } = parseCharaFields(description);
            
            let personalityPrompt = "";
            if (typeof backstory == "string") {
                personalityPrompt = backstory
                    .replaceAll("your", "the user's")
                    .replaceAll("you", "the user");
                
                pronouns = getPronouns(backstory);
            }

            if (typeof personality == "string")
                personalityPrompt += `\n${pronouns.personal} is ${personality}.`;
            if (typeof body == "string")
                personalityPrompt += `\n${pronouns.possessive} appearance is described as ${body}.`;
            if (typeof clothing == "string")
                personalityPrompt += `\n${pronouns.personal} is currently wearing ${clothing}.`;
            if (typeof sexual_orientation == "string")
                personalityPrompt += `\n${pronouns.possessive} sexual orientation is ${sexual_orientation}.`;
            if (typeof likes == "string")
                personalityPrompt += `\n${pronouns.personal} likes: ${likes}.`;
            if (typeof dislikes == "string")
                personalityPrompt += `\n${pronouns.personal} dislikes: ${likes}.`;
            if (typeof quirks == "string")
                personalityPrompt += `\n${pronouns.possessive} quirks are: ${quirks}.`;

            returnData.personalityPrompt = personalityPrompt;
            returnData.pronouns = pronouns;
        } else {
            returnData.personalityPrompt = description;
            returnData.pronouns = getPronouns(description);
        }
        
        returnData.avatarURL = `/image/chara/${charaId}.webp`;

        returnData.startMessage = first_mes;
        returnData.exampleConvo = mes_example.replaceAll("<START>", "");

        return res.status(200).send({ success: true, characterData: returnData });
    }
}