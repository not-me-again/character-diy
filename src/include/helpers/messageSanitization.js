const showdown = require("showdown");

// todo parse for uncompleted markdown tags (* or **) and auto-complete at the end to prevent styles jumping around

module.exports = function(inputText) {
    // convert the inputText from markdown to HTML, while stripping any tags to prevent XSS
    let sanitizedText = inputText.replace(/\</g, "&lt;").replace(/\>/g, "&gt;");
    let mdConverter = new showdown.Converter();
    let safeHTML = mdConverter.makeHtml(sanitizedText);
    // all clean!
    return safeHTML;
}