const cache = require("../cache");
const db = require("../db");
const generateStartPrompt = require("./generateStartPrompt");
const sanitizeMessageText = require("./sanitizeMessageText");
const removeListenerSafe = require("./removeListenerSafe");
const signupHandler = require("./signupHandler");

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
        
        let botAuthorName = "User";

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
            name: cachedCharacter["displayName"]
        }

        let poeInstance = await cache.getPoeInstance(chatId);
        if (!poeInstance) {
            let authCookie = await chat.get("poeCookie");
            if ((typeof authCookie != "string") || (authCookie.length <= 0)) {
                authCookie = await signupHandler().catch(console.error);
                await chat.set("poeCookie", authCookie);
            }
            
            let backend = charData.backend;
            if (!backend)
                backend = "claude";

            poeInstance = await cache.newPoeInstance(chatId, authCookie, backend);
        }

        await poeInstance.resetChat();

        let startPromptData = {
            ...charData,
            customUserName: await user.get("displayName"),
            customUserContext: await user.get("customChatContext")
        }

        const dataStream = poeInstance.sendMessage(generateStartPrompt(startPromptData));
        dataStream.on("error", errObj => {
            console.error(errObj);

            didFinish = true;

            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "messageComplete");

            reject("Failed to send start message");
        });
        dataStream.on("messageComplete", messageData => {
            // clear event listeners
            removeListenerSafe(dataStream, "error");
            removeListenerSafe(dataStream, "messageComplete");
            // deserialize data
            ///////////const rawMessageText = messageData.text;
            const rawMessageText = (typeof charData.startMessage == "string") ? charData.startMessage : messageData.text;
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
                    moods: messageData.currentMoods,
                    customLabel: `@${botAuthorName}`
                }
            ], true);
            // set finished
            resolve();
        });
    });
}