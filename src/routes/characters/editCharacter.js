const { PRONOUN_CONVERSION, AVAILABLE_MODELS, MAX_FILE_SIZE } = require("../../../config.json");
const { handleImageUpload } = require("../../include/helpers/imageService");
const db = require("../../include/db");
const cache = require("../../include/cache");

const formidable = require("formidable");
const fs = require("fs");

module.exports = {
    method: "POST",
    path: "/api/characters/:characterId/edit",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");

        const { character, isCharacterOwner } = req;
        if (!isCharacterOwner)
            return res.status(403).send({ success: false, error: "unauthorized" });

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
            if (!AVAILABLE_MODELS.find(model => model.ID == backend))
                backend = "gpt-3.5-turbo";

            const {
                displayName,
                exampleConvo,
                startMessage,
                blurb,
                personalityPrompt,
                isPublic,
                charaAvatar,
                isImageGenerating
            } = config;

            if ((typeof charaAvatar == "string") && (charaAvatar.length > 0) && (charaAvatar.match(/\w+\.\w+/mi)))
                avatarURL = `/image/chara/${charaAvatar}`;

            if (displayName.length < 2)
                return res.status(400).send({ success: false, error: "display_name_too_short" });
            else if (displayName.length > 32)
                return res.status(400).send({ success: false, error: "display_name_too_long" });

            if (exampleConvo.length > 1000)
                return res.status(400).send({ success: false, error: "example_convo_too_long" });

            if (blurb.length < 1)
                return res.status(400).send({ success: false, error: "blurb_too_short" });
            else if (blurb.length > 100)
                return res.status(400).send({ success: false, error: "blurb_too_long" });

            if (startMessage.length < 1)
                return res.status(400).send({ success: false, error: "start_message_too_short" });
            else if (startMessage.length > 1000)
                return res.status(400).send({ success: false, error: "start_message_too_long" });

            if ((typeof avatarURL == "string") && (avatarURL.length >= 1))
                await character.set("avatarURL", avatarURL);

            await character.set({
                updatedAt: Date.now(),
                displayName,
                exampleConvo,
                startMessage,
                blurb,
                personalityPrompt,
                backend,
                pronouns,
                isPublic,
                isImageGenerating,
                id: character.id,
                updateId: db.getUniqueId()
            });
            await character.save();
            
            if (!isPublic)
                cache.removePopularCharacterById(character.id);

            let characterData = { ...character.getObject() };
        
            res.status(200).send({ success: true, character: characterData });
        });
    }
}