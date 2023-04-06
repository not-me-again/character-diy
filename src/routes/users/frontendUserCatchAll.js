const path = require("path");

const chatPage = path.join(path.resolve(__dirname), "../../../client/edit-user-settings.html");

module.exports = {
    path: "/user",
    method: "GET",
    async callback(req, res) {
        return res.sendFile(chatPage);
    }
}