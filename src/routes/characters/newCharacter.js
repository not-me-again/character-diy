const { getQuotasForUserId } = require("../../include/helpers/quotaManager");
const { PRONOUN_CONVERSION, AVAILABLE_MODELS, MAX_FILE_SIZE } = require("../../../config.json");
const { handleImageUpload } = require("../../include/helpers/imageService");
const db = require("../../include/db");

const formidable = require("formidable");
const fs = require("fs");

module.exports = {
    method: "POST",
    path: "/api/newCharacter",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");

        const { MAX_ALLOWED_CHARS_PER_USER } = await getQuotasForUserId(userId);
        
        let chars = await user.get("characters");
        if (chars.length >= MAX_ALLOWED_CHARS_PER_USER)
            return res.status(403).end({ success: false, error: "character_limit_reached" });

        const form = formidable({ multiples: true });
        form.parse(req, async (err, fields, files) => {
            if (err)
                return res.status(500).send({ success: false, error: err });
                
            const { settings: rawSettings } = fields;
            if (typeof rawSettings != "string")
                return res.status(400).send({ success: false, error: "no_settings" });

            let config = JSON.parse(rawSettings);

            let avatarURL = "";
            const { avatar } = files;
            if (avatar) {
                const { filepath, size } = avatar;
                if (size <= MAX_FILE_SIZE) {
                    const data = await handleImageUpload(filepath);
                    if (data && data.fileName)
                        avatarURL = data.fileName;    
                    fs.rmSync(filepath);
                } else {
                    fs.rmSync(filepath);
                    return res.status(413).send({ success: "false", error: "file_too_large" });
                }
            }

            let pronouns = PRONOUN_CONVERSION[config.pronouns];
            if (!pronouns)
                pronouns = PRONOUN_CONVERSION["they/them/their"];

            let backend = config.backend;
            if (!AVAILABLE_MODELS.find(b => b.ID == backend))
                backend = "gpt-3.5-turbo";

            const newChar = db.getCharacter(db.getUniqueId());

            const {
                displayName,
                exampleConvo,
                startMessage,
                blurb,
                personalityPrompt,
                isPublic,
                charaAvatar
            } = config;
            
            if ((typeof charaAvatar == "string") && (charaAvatar.length > 0) && (charaAvatar.match(/\w+\.\w+/mi)))
                avatarURL = `/image/chara/${charaAvatar}`;

            await newChar.set({
                createdAt: Date.now(),
                updatedAt: Date.now(),
                authorId: userId,
                avatarURL,
                displayName,
                exampleConvo,
                startMessage,
                blurb,
                personalityPrompt,
                backend,
                pronouns,
                isPublic,
                id: newChar.id,
                updateId: db.getUniqueId()
            });
            await newChar.save();

            chars.push(newChar.id);
            await user.set("characters", chars);
            await user.save();

            let characterData = { ...newChar.getObject() };
        
            res.status(200).send({ success: true, character: characterData });
        });
    }
}