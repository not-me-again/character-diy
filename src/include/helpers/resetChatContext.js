const db = require("../db");
const sanitizeMessageText = require("./sanitizeMessageText");

const sleep = ms => new Promise(res => setTimeout(res, ms));

module.exports = chat => {
    return new Promise(async (resolve, reject) => {
        if (!chat)
            return reject("Expected argument #1 to be type Chat");
        const chatId = await chat.get("id");

        const userId = await chat.get("ownerId");
        if (!userId)
            return reject("Chat has no owner!");

        const user = db.getUser(userId);
        if (!await user.exists())
            return reject("Invalid chat owner!");

        const activeCharacterId = await chat.get("activeCharacterId");
        
        let botAuthorName = "Deleted User";
        const userName = await user.get("displayName");

        const character = db.getCharacter(activeCharacterId);
        if (await character.exists()) {
            const authorId = await character.get("authorId");
            const botAuthor = db.getUser(authorId);
            if (await botAuthor.exists())
                botAuthorName = await botAuthor.get("displayName");
        }

        const cachedCharacter = await chat.getCharacterData();
        if (typeof cachedCharacter != "object")
            return reject("Chat does not contain a valid character");

        const charData = {
            backend: cachedCharacter["backend"],
            startMessage: cachedCharacter["startMessage"],
            personalityPrompt: cachedCharacter["personalityPrompt"],
            exampleConvo: cachedCharacter["exampleConvo"],
            blurb: cachedCharacter["blurb"],
            pronouns: cachedCharacter["pronouns"],
            name: cachedCharacter["displayName"],
            isImageGenerating: cachedCharacter["isImageGenerating"]
        }
        
        let startMessage = charData.startMessage
            if (typeof startMessage == "string")
                startMessage = startMessage
                    .replaceAll("{{user}}", userName)
                    .replaceAll("{{char}}", charData.name);

        /*let startPromptData = {
            ...charData,
            customUserName: await user.get("displayName"),
            customUserContext: await user.get("customChatContext"),
            isFilterEnabled: await chat.get("isFilterEnabled")
        }*/

        const rawMessageText = (typeof startMessage == "string") ? startMessage : "Hello!";
        // sanitize text
        //const sanitizedMessageText = sanitizeMessageText(rawMessageText);
        // append chat history
        chat.addMessages([
            {
                id: db.getUniqueId(),
                authorType: "ai",
                authorId: activeCharacterId,
                timestamp: Date.now(),
                isFiltered: false,
                text: rawMessageText/*sanitizedMessageText*/,
                moods: /*messageData.currentMoods*/[],
                customLabel: `@${botAuthorName}`
            }
        ], true);
        // set finished
        resolve();
    });
}