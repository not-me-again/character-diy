const { SYSTEM_PROMPT_FORMATS } = require("../../../config.json");

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
    const { backend, startMessage, personalityPrompt, exampleConvo, blurb, pronouns, name } = charData;
    let conversationPromptLines = [];
    for (const message of [ ...messageHistory ]) {
        conversationPromptLines.push(`${(message.authorType == "ai") ? name : userName}: ${message.text}`);
    }
    conversationPromptLines.push(`${userName}: ${nextMessage}`);
    conversationPromptLines = shortenConversation(conversationPromptLines, CONTEXT_LENGTHS[backend]);
    const charSystemPrompt = SYSTEM_PROMPT_FORMATS[backend?.match(/^\w+(?=\-)/si)?.toString()?.toUpperCase()] ?? SYSTEM_PROMPT_FORMATS.GPT;
    let system = charSystemPrompt
        .replace("{{BLURB}}", blurb)
        .replace("{{NAME}}", name)
        .replace("{{PRONOUNS_POSSESSIVE}}", pronouns.possessive)
        .replace("{{PERSONALITY}}", personalityPrompt);
    let prompt = `Current conversation:\n${conversationPromptLines.join("\n")}\n${name}: `;
    return { system, prompt };
}