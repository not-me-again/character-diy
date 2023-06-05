const { SYSTEM_PROMPT_FORMATS, AVAILABLE_MODELS, IMAGE_PROMPT_FORMAT } = require("../../../config.json");

function shortenConversation(conversationPromptLines, maxLength) {
    while (conversationPromptLines.join("\n").length >= maxLength)
        conversationPromptLines.splice(0, 1);
    return conversationPromptLines;
}

const CONTEXT_LENGTHS = {
    //more params = less tokens (transformers)
    "gpt-3.5-turbo": 6_000,
    "gpt-4": 16_000,
    "claude": 10_000
}

module.exports = function(charData, messageHistory, nextMessage, userName) {
    if ((typeof userName != "string") || (userName.length <= 0))
        userName = "User";
    const { backend, startMessage, personalityPrompt, exampleConvo, blurb, pronouns, name, isImageGenerating } = charData;
    let conversationPromptLines = [];
    for (const message of [ ...messageHistory ]) {
        conversationPromptLines.push(`${(message.authorType == "ai") ? name : userName}: ${message.text}`);
    }
    let exampleConvoLines = [];
    if ((typeof exampleConvo == "string") && (exampleConvo.length >= 1)) {
        for (const line of exampleConvo.split("\n"))
            exampleConvoLines.push(line.replace(/\{\{user\}\}/g, userName).replace(/\{\{char\}\}/g, name));
    }
    const model = AVAILABLE_MODELS.find(m => m?.ID?.toLowerCase() == backend?.toLowerCase());
    let maxConvoLength = (model?.CONTEXT_LENGTH * 1.25) ?? CONTEXT_LENGTHS[backend];
    maxConvoLength -= exampleConvoLines.join("\n").length;
    conversationPromptLines.push(`${userName}: ${nextMessage}`);
    conversationPromptLines = shortenConversation(conversationPromptLines, maxConvoLength);
    const charSystemPrompt = SYSTEM_PROMPT_FORMATS[backend?.match(/^\w+(?=\-)/si)?.toString()?.toUpperCase()] ?? SYSTEM_PROMPT_FORMATS.GPT;
    let system = charSystemPrompt.toString()
        .replace(/{{BLURB}}/g, blurb)
        .replace(/{{NAME}}/g, name)
        .replace(/{{PRONOUNS_POSSESSIVE}}/g, pronouns.possessive)
        .replace(/{{PERSONALITY}}/g, personalityPrompt)
        + (isImageGenerating ? ` ${IMAGE_PROMPT_FORMAT}` : "");
    let prompt = `${(exampleConvoLines.length >= 1) ? `Previous conversation:\n${exampleConvoLines.join("\n")}\n` : ""}Current conversation:\n${conversationPromptLines.join("\n")}\n${name}: `;
    return { system, prompt };
}