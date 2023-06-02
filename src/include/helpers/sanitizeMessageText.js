const removeXSS = require("./removeXSS");

module.exports = (rawMessageText) => {
    let messageText = removeXSS(rawMessageText.trim());

    return messageText;
}