const { MAX_ALLOWED_CHARS_PER_USER, PRONOUN_CONVERSION, BACKEND_CONVERSION, MAX_FILE_SIZE } = require("../../../config.json");
const { handleImageUpload } = require("../../include/helpers/imageService");
const db = require("../../include/db");

const formidable = require("formidable");
const fs = require("fs");

module.exports = {
    method: "POST",
    path: "/api/updateUser",
    async callback(req, res) {
        const { user } = req.auth;
        if (!user)
            return res.status(404).send({ success: false, error: "user_not_found" });

        const form = formidable({ multiples: true });
        form.parse(req, async (err, fields, files) => {
            if (err)
                return res.status(500).send({ success: false, error: err });
                
            const { settings: rawSettings } = fields;
            if (typeof rawSettings != "string")
                return res.status(400).send({ success: false, error: "no_settings" });

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

            if (avatarURL.length > 0)
                await user.set("profilePictureURL");

            let config = JSON.parse(rawSettings);

            const displayName = typeof config.displayName == "string" ? config.displayName.trim() : undefined;
            if (displayName && (displayName.length >= 3))
                await user.set("displayName", displayName);

            if (typeof config.birthdate == "number")
                await user.set("birthdate", config.birthdate);

            const customChatContext = typeof config.customChatContext == "string" ? config.customChatContext.trim() : undefined;
            if (customChatContext && (customChatContext.length >= 1))
                await user.set("customChatContext", config.customChatContext);
            
            await user.save();
        
            res.status(200).send({ success: true });
        });
    }
}