const path = require("path");

const notFoundPage = path.join(path.resolve(__dirname), "../../../client/404.html");

async function notFoundMiddleware(req, res) {
    res.status(404).sendFile(notFoundPage);
}
module.exports = notFoundMiddleware;