const { BACKEND_CONVERSION } = require("../../../config.json");

const fs = require("fs");
const path = require("path");

const db = require("../../include/db");
const removeXSS = require("../../include/helpers/removeXSS");

const characterEditPage = path.join(path.resolve(__dirname), "../../../client/view-character.html");
const characterEditPageHTML = fs.readFileSync(characterEditPage, { encoding: "utf-8" });

module.exports = {
    paths: [
        {
            path: "/characters/:characterId/view",
            method: "GET"
        }
    ],
    async callback(req, res, next) {
        let pageHTML = characterEditPageHTML;

        const { user } = req.auth;
        const userId = user ? (await user.get("id")) : "-1";
        
        const { characterId } = req.params;

        const character = db.getCharacter(characterId);
        if (!await character.exists())
            return next();

        const isPublic = await character.get("isPublic");
        const authorId = await character.get("authorId");
        if (!isPublic && (authorId != userId))
            return next();

        const charAuthor = db.getUser(authorId);
        const charAuthorName = await charAuthor.get("displayName");

        let friendlyBackendName = "claude";
        const currentBackend = await character.get("backend");
        if (typeof currentBackend == "string") {
            const newBackend = Object.entries(BACKEND_CONVERSION)?.find(e => e[1] == currentBackend);
            friendlyBackendName = (newBackend && (newBackend.length >= 2)) ? newBackend[0] : "claude";
        }

        res.status(200).send(
            pageHTML
                .replaceAll("%%char_name%", removeXSS(await character.get("displayName")))
                .replaceAll("%%char_pfp%", removeXSS(await character.get("avatarURL")))
                .replaceAll("%%char_blurb%", removeXSS(await character.get("blurb")))
                .replaceAll("%%char_backend%", removeXSS(friendlyBackendName))
                .replaceAll("%%char_authorName%", removeXSS(charAuthorName))
                .replaceAll("%%char_showPubWarn%", !isPublic ? "1" : "0")
        );
    }
}