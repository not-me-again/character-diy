const path = require("path");

const characterEditPage = path.join(path.resolve(__dirname), "../../../client/edit-character.html");

module.exports = {
    paths: [
        {
            path: "/characters/:characterId/edit",
            method: "GET"
        },
        {
            path: "/characters/new",
            method: "GET"
        }
    ],
    async callback(req, res) {
        return res.sendFile(characterEditPage);
    }
}