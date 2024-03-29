const { SYSTEM_PROMPT_FORMATS, AVAILABLE_MODELS, IMAGE_PROMPT_FORMAT, USER_CONTEXT_PROMPT_FORMAT } = require("../../../config.json");

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

function getClaudePrefix(message) {
    return (message.authorType == "ai")
        ? "\n\nAssistant:"
        : "\n\n";
}

module.exports = function(charData, messageHistory, nextMessage, userName, userDescription) {
    if ((typeof userName != "string") || (userName.length <= 0))
        userName = "User";
    const { backend, startMessage, personalityPrompt, exampleConvo, blurb, pronouns, name, isImageGenerating } = charData;
    let conversationPromptLines = [];
    for (const message of [ ...messageHistory ].reverse()) {
        let authorPrefix = backend.startsWith("claude-") ? getClaudePrefix(message) : "";
        let authorName = (authorPrefix.length == 0) ? ((message.authorType == "ai") ? name : userName) : "";
        conversationPromptLines.push(`${authorPrefix}${authorName} ${message.text.trim()}`);
    }
    let exampleConvoLines = [];
    if ((typeof exampleConvo == "string") && (exampleConvo.length >= 1)) {
        for (const line of exampleConvo.split("\n").reverse())
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
    system += " " + USER_CONTEXT_PROMPT_FORMAT
        .replace(/{{USER_NAME}}/g, userName)
        .replace(/{{USER_DESCRIPTION}}/g, userName, userDescription);
    let prompt = `${(exampleConvoLines.length >= 1) ? `Previous conversation:\n${exampleConvoLines.join("\n")}\n` : ""}Current conversation:\n${conversationPromptLines.join("\n")}\n${name}: `;
    if (backend == "gpt-3.5-turbo") {
        prompt = `${system}\n\n${prompt}`;
        system = "";
    }
    return { system, prompt };
}