const { AGE_OF_MAJORITY_MS, FILTERED_TEXT_PLACEHOLDER } = require("../../../config.json");

const nsfwFilter = require("../../include/helpers/nsfwFilter");
const imageService = require("../../include/helpers/imageService");
const sanitizeMessageText = require("../../include/helpers/sanitizeMessageText");
const generateConversationPrompt = require("../../include/helpers/generateConversationPrompt");
const handleCharacterInteractionDataUpdate = require("../../include/helpers/handleCharacterInteractionDataUpdate");
const handleImageGeneration = require("../../include/helpers/handleImageGeneration");
const { Logger, colors } = require("../../include/logging");
const db = require("../../include/db");
const inferencer = require("../../include/inference");

const log = new Logger("InferenceAPI");

let activeChatInferences = {};

const DEFAULTS = {
    MOOD_CAPTURE_REGEX: /(\(\s*[#]*mood\=)([a-zA-Z0-9\- ,]*)(\s*\))/gsi,
    IMAGE_PROMPT_CAPTURE_REGEX: /[\(|\[|\{]\s*?#image\=\s*?\[?([\w \/\-,.!]+)\]?\s*?[\)\}\]]/si
}

function replaceDynamicIdentifiers(str, opts) {
    let { userName, name } = opts;
    if (typeof name == "string")
        str = str.replaceAll("{{char}}", name);
    if (typeof userName == "string")
        str = str.replaceAll("{{user}}", userName);
    return str;
}

function processMessageData(messageText) {
    let messageData = {};

    messageText = messageText.replaceAll(/\*\s*(.*?(?=\s*?))\s*\*/gmi, "*$1*");

    // BEGIN MOOD EVALUATION //
    let characterMoods = [];
    const moodMatches = Array.from(messageText.matchAll(DEFAULTS.MOOD_CAPTURE_REGEX));
    if (moodMatches.length >= 1)
        for (let match of moodMatches)
            if (match.length >= 3)
                for (let mood of match[2].split(/,\s*/))
                    characterMoods.push(mood.trim());
    // END MOOD EVALUATION //

    // BEGIN IMAGE GENERATION //
    let imagePrompt = "";
    const imagePromptMatch = messageText.match(DEFAULTS.IMAGE_PROMPT_CAPTURE_REGEX);
    if (imagePromptMatch && (imagePromptMatch.length >= 2))
        imagePrompt = imagePromptMatch[1].toString().trim();
    // END IMAGE GENERATION //
    
    // BEGIN MESSAGEDATA MODIFICATIONS //
    messageText = messageText.replace(DEFAULTS.MOOD_CAPTURE_REGEX, "");
    messageText = messageText.replace(DEFAULTS.IMAGE_PROMPT_CAPTURE_REGEX, "");
    messageText = messageText.replace(/(\(\s*[#]*\w+\=)([a-zA-Z0-9\- ,]*)\)/gmi, "");

    messageData.currentMoods = characterMoods;
    messageData.author = this.botType;
    if (imagePrompt.length >= 1)
        messageData.imagePrompt = imagePrompt;
    // END MESSAGEDATA MODIFICATIONS //

    // BEGIN JAILBREAK STUFF //
    const lowercaseMessage = messageText.toLowerCase();
    messageData.isBreakingCharacter = lowercaseMessage.includes("anthropic, pbc")
        || lowercaseMessage.includes("constitutional ai")
        || lowercaseMessage.includes("ai assistant")
        || lowercaseMessage.includes("chatgpt")
        || lowercaseMessage.match(/\w+\:\/\/poe\.com/i)
        || lowercaseMessage.includes("usage guidelines")
        || lowercaseMessage.match(/am (not |un)able to \w+ (in|with) \w*\s?content/i)
        || lowercaseMessage.match(/as an ai (language)?\s?model/i);
    // END JAILBREAK STUFF //

    messageData.text = messageText;

    return messageData;
}

function writeJSON(res, data, isFinal) {
    res.write(`${JSON.stringify(data)}\n`);
    if (isFinal)
        res.end("<|endofstream|>");
}

module.exports = {
    method: "POST",
    path: "/api/chats/:chatId/inference",
    async callback(req, res) {
        const { user } = req.auth;
        const userId = await user.get("id");

        const chat = req.chat;
        if (!chat)
            return res.status(500).send({ success: false, error: "preflight_condition2_failure" });
        const chatId = await chat.get("id");

        /*if (activeChatInferences[chatId])
            return res.status(429).send({ success: false, error: "ongoing_inference" });*/
        activeChatInferences[chatId] = true;

        const { text: rawUserMessageText } = req.body;
        if (typeof rawUserMessageText != "string")
            return res.status(400).send({ success: false, error: "message_blank" });
        
        const userMessageText = rawUserMessageText.trim();
        if (userMessageText.length <= 0)
            return res.status(400).send({ success: false, error: "message_emtpy" });

        if (userMessageText.length >= 4_000)
            return res.status(400).send({ success: false, error: "too_many_tokens" });
            
        const characterId = await chat.get("activeCharacterId");
        log.info("Inferencing for character ID " + characterId + " @ chat ID " + chatId);

        const cachedCharacter = await chat.getCharacterData();
        if (!cachedCharacter)
            return res.status(500).send({ success: false, error: "no_cached_character" });

        const charData = {
            backend: cachedCharacter["backend"],
            startMessage: cachedCharacter["startMessage"],
            personalityPrompt: cachedCharacter["personalityPrompt"],
            exampleConvo: cachedCharacter["exampleConvo"],
            blurb: cachedCharacter["blurb"],
            pronouns: cachedCharacter["pronouns"],
            name: cachedCharacter["displayName"]
        }
        
        const isImageGenerating = cachedCharacter["isImageGenerating"];
        const filterEnabled = await chat.get("isFilterEnabled");
        const userBirthdate = await user.get("birthdate");
        const needsFiltering = filterEnabled || typeof userBirthdate != "number" || ((Date.now() - userBirthdate) < AGE_OF_MAJORITY_MS);

        if (needsFiltering)
            log.info("User needs filter");

        res.writeHead(200, { "Content-Type": "application/json" });
        
        const sanitizedMessageText = sanitizeMessageText(userMessageText);
        let selfMessageObject = {
            id: db.getUniqueId(),
            authorType: "user",
            authorId: userId,
            timestamp: Date.now(),
            isFiltered: false,
            text: sanitizedMessageText,
            moods: []
        }
        writeJSON(res, {
            error: false,
            messageObject: selfMessageObject
        });

        let messageData = {};
        let botMessageObject = {};

        const userName = await user.get("displayName");

        const { system, prompt } = generateConversationPrompt(charData, await chat.get("messages"), userMessageText, userName);
        try {
            for await (const textChunk of inferencer.query({ model: charData.backend, system, prompt })) {

                let isFiltered = false;

                messageData = processMessageData(textChunk);

                if (needsFiltering && !isFiltered) {
                    const filterResult = nsfwFilter(messageData);
                    if (filterResult.isFiltered) {
                        isFiltered = true;
                        log.info("Response was filtered! Caught by:", filterResult.caughtBy);
                    }
                }

                const moods = messageData.currentMoods;
                const rawMessageText = messageData.text;
                const isBreakingCharacter = messageData.isBreakingCharacter;

                const sanitizedMessageText = sanitizeMessageText(rawMessageText);

                // update bot message data
                botMessageObject = {
                    id: db.getUniqueId(),
                    authorType: "ai",
                    authorId: characterId,
                    timestamp: Date.now(),
                    isFiltered,
                    text: isFiltered ? FILTERED_TEXT_PLACEHOLDER : replaceDynamicIdentifiers(sanitizedMessageText, { userName, name: charData.name }),
                    moods: isFiltered ? [] : moods
                }

                let responseObj = { error: false, messageObject: botMessageObject }

                if (isBreakingCharacter) {
                    responseObj.error = true;
                    responseObj.message = "No character reply";
                }

                writeJSON(res, responseObj);
            }
        } catch(err) {
            log.error("Error occurred while inferencing:", err);

            const responseObj = { error: true, message: err.toString() };

            return writeJSON(res, responseObj, true);
        }
        
        const handleMessageEnd = async (finalMessageData) => {
            // assign unique id to bot message
            botMessageObject.isFinal = true;
            botMessageObject.id = db.getUniqueId();
            log.info("Inference finished for character ID " + characterId + " @ chat ID " + chat.id);
            //  end req
            writeJSON(res, { error: false, messageObject: botMessageObject }, true);
            // call callback
            if (typeof doneCallback == "function")
                doneCallback(finalMessageData);
            // sanity check so we don't add filtered messages
            // download imgs
            let proxyBotMessage = {
                ...botMessageObject
            };
            delete proxyBotMessage.isAwaitingImageGeneration;
            delete proxyBotMessage.imageGenerationETA;
            if (typeof botMessageObject.image == "object") {
                let img = {};
                img.prompt = botMessageObject.image.prompt;
                const images = botMessageObject.image.imageCandidates;
                if (typeof images == "object") {
                    img.imageCandidates = [];
                    for (const imageData of images) {
                        try {
                            const { fileName } = await imageService.handleDataUriUpload(imageData);
                            img.imageCandidates.push(fileName);
                        } catch(err) {
                            log.error("Failed to upload image", err);
                        }
                    }
                }
                proxyBotMessage.image = img;
            }
            // append chat history
            chat.addMessages([
                selfMessageObject,
                proxyBotMessage
            ]);
            log.info("Final messageObject:", proxyBotMessage);
            // handle char data updates (message count, etc.)
            handleCharacterInteractionDataUpdate(characterId);
        }
        // log completion
        log.info("Inference complete");
        // handle image generationg if needed
        if (isImageGenerating && (typeof messageData.imagePrompt == "string")) {
            botMessageObject.isAwaitingImageGeneration = true;
            writeJSON(res, { error: false, messageObject: botMessageObject });
            const imageStream = handleImageGeneration(messageData);
            imageStream.on("etaUpdate", estimationData => {
                const { eta } = estimationData;
                botMessageObject.imageGenerationETA = eta;
                botMessageObject.isAwaitingImageGeneration = true;
                writeJSON(res, { error: false, messageObject: botMessageObject });
            });
            imageStream.on("error", err => {
                botMessageObject.isAwaitingImageGeneration = false;
                log.error("Failed to generate image:", err);
                botMessageObject.image = { error: err };
                handleMessageEnd(messageData);
            });
            imageStream.on("imageDone", image => {
                botMessageObject.image = image;
                botMessageObject.selectedImageIndex = 0;
                //log.info("Image ready:", image);
                botMessageObject.isAwaitingImageGeneration = false;
                handleMessageEnd(messageData);
            });
        } else {
            // run finals
            handleMessageEnd(messageData);
        }
    }
}