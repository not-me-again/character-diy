const removeXSS = require("./removeXSS");

module.exports = (rawMessageText) => {
    let messageText = rawMessageText//removeXSS(rawMessageText.trim());

    return messageText;
}