const path = require("path");

const chatPage = path.join(path.resolve(__dirname), "../../../client/chat.html");

module.exports = {
    path: "/chats/:chatId",
    method: "GET",
    async callback(req, res) {
        return res.sendFile(chatPage);
    }
}