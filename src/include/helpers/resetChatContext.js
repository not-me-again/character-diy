const cache = require("../cache");
const db = require("../db");
const { Poe } = require("../poe");
const generateStartPrompt = require("./generateStartPrompt");
const sanitizeMessageText = require("./sanitizeMessageText");
const removeListenerSafe = require("./removeListenerSafe");
//const signupHandler = require("./signupHandler");

const poeCookieStore = db.getPoeCookieStore();

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

        let poeInstance = await cache.getPoeInstance(chatId);
        if (!poeInstance) {
            let authCookie = await chat.get("poeCookie");
            if ((typeof authCookie != "string") || (authCookie.length <= 0)) {
                authCookie = await poeCookieStore.allocateCookieForChat(chatId);
            }

            let poeChatId = await chat.get("poeChatId");
            if ((typeof poeChatId != "number") || (poeChatId <= 0)) {
                let tries = 0;
                while ((tries < 2) && (!poeChatId)) {
                    tries++;
                    try {
                        poeChatId = await Poe.createChat(authCookie);
                    } catch(err) {
                        authCookie = await poeCookieStore.allocateCookieForChat(chatId);
                    }
                }
                await chat.set("poeChatId", poeChatId);
            }
            
            await chat.set("poeCookie", authCookie);
            
            let backend = charData["backend"];
            if (!backend)
                backend = "claude";

            poeInstance = await cache.newPoeInstance(chatId, authCookie, backend, poeChatId);
        }

        await poeInstance.resetChat();

        let startPromptData = {
            ...charData,
            customUserName: await user.get("displayName"),
            customUserContext: await user.get("customChatContext"),
            isFilterEnabled: await chat.get("isFilterEnabled")
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
            const rawMessageText = (typeof startMessage == "string") ? startMessage : messageData.text;
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