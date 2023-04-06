const cache = require("../cache");
const db = require("../db");
const generateStartPrompt = require("./generateStartPrompt");
const sanitizeMessageText = require("./sanitizeMessageText");
const removeListenerSafe = require("./removeListenerSafe");

const sleep = ms => new Promise(res => setTimeout(res, ms));

module.exports = async chat => {
    if (!chat)
        throw new Error("Expected argument #1 to be type Chat");
    const chatId = await chat.get("id");

    const userId = await chat.get("ownerId");
    if (!userId)
        throw new Error("Chat has no owner!");

    const activeCharacterId = await chat.get("activeCharacterId");
    const character = db.getCharacter(activeCharacterId);
    if (!await character.exists())
        throw new Error("Chat does not contain a valid character");

    const charData = {
        backend: await character.get("backend"),
        startMessage: await character.get("startMessage"),
        personalityPrompt: await character.get("personalityPrompt"),
        exampleConvo: await character.get("exampleConvo"),
        blurb: await character.get("blurb"),
        pronouns: await character.get("pronouns"),
        name: await character.get("displayName")
    }

    let poeInstance = await cache.getPoeInstance(chatId);
    if (!poeInstance) {
        const authCookie = await chat.get("poeCookie");
        
        let backend = charData.backend;
        if (!backend)
            backend = "claude";

        poeInstance = await cache.newPoeInstance(chatId, authCookie, backend);
    }

    await poeInstance.resetChat();
    
    let didFinish = false;

    const dataStream = poeInstance.sendMessage(generateStartPrompt(charData));
    dataStream.on("error", errObj => {
        console.error(errObj);

        didFinish = true;

        removeListenerSafe(dataStream, "error");
        removeListenerSafe(dataStream, "messageComplete");

        throw new Error("Failed to send start message");
    });
    dataStream.on("messageComplete", messageData => {
        // clear event listeners
        removeListenerSafe(dataStream, "error");
        removeListenerSafe(dataStream, "messageComplete");
        // deserialize data
        const rawMessageText = messageData.text;
        // sanitize text
        const sanitizedMessageText = sanitizeMessageText(rawMessageText);
        // append chat history
        chat.addMessages([
            {
                id: db.getUniqueId(),
                poeId: messageData.messageId,
                authorType: "ai",
                authorId: activeCharacterId,
                timestamp: Date.now(),
                isFiltered: false,
                text: sanitizedMessageText,
                moods: messageData.currentMoods
            }
        ], true);
        // set finished
        didFinish = true;
    });

    while (!didFinish)
        await sleep(100);

    return;
}