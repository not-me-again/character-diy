const { OAUTH_URL } = require("../include/helpers/discordAuth");

module.exports = {
    method: "GET",
    path: "/login/discord",
    callback: (_req, res) => res.redirect(302, OAUTH_URL)
}