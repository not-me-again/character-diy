const { Converter } = require("showdown");

module.exports = (rawMessageText) => {
    let messageText = rawMessageText.trim();
    // todo: replace poe:// links with custom identifiers

    const markdownParser = new Converter();
    const parsedHTML = markdownParser.makeHtml(messageText);

    return parsedHTML.toString();
}