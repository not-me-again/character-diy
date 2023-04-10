const { BACKEND_CONVERSION } = require("../../../config.json");

const fs = require("fs");
const path = require("path");

const db = require("../../include/db");
const removeXSS = require("../../include/helpers/removeXSS");

const chatViewPage = path.join(path.resolve(__dirname), "../../../client/view-chat.html");
const chatViewPageHTML = fs.readFileSync(chatViewPage, { encoding: "utf-8" });

module.exports = {
    paths: [
        {
            path: "/archive/:savedChatId",
            method: "GET"
        }
    ],
    async callback(req, res, next) {
        let pageHTML = chatViewPageHTML;

        const { user } = req.auth;
        const userId = user ? (await user.get("id")) : "-1";
        
        const { savedChatId } = req.params;
        const savedChat = await db.getSavedChat(savedChatId);
        if (!await savedChat.exists())
            return next();

        const character = await savedChat.get("cachedCharacterData");

        const isPublic = await savedChat.get("isPublic");
        const authorId = await savedChat.get("ownerId");
        if (!isPublic && (authorId != userId))
            return next();
        const hasEditPermission = authorId == userId;

        res.status(200).send(
            pageHTML
                .replaceAll("%%char_name%", removeXSS(character.displayName))
                .replaceAll("%%char_pfp%", removeXSS(character.avatarURL))
                .replaceAll("%%chat_name%", removeXSS(await savedChat.get("name")))
        );
    }
}