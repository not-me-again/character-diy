// helper funcs
function readChunks(reader) {
    return {
        async*[Symbol.asyncIterator]() {
            let readResult = await reader.read();
            while (!readResult.done) {
                yield readResult.value;
                readResult = await reader.read();
            }
        },
    };
}
async function* readLines(reader) {
    const textDecoder = new TextDecoder();
    let partOfLine = '';
    for await (const chunk of readChunks(reader)) {
        const chunkText = textDecoder.decode(chunk);
        const chunkLines = chunkText.split('\n');
        if (chunkLines.length === 1) {
            partOfLine += chunkLines[0];
        } else if (chunkLines.length > 1) {
            yield partOfLine + chunkLines[0];
            for (let i = 1; i < chunkLines.length - 1; i++) {
                yield chunkLines[i];
            }
            partOfLine = chunkLines[chunkLines.length - 1];
        }
    }
}
async function* parseJsonStream(readableStream) {
    for await (const line of readLines(readableStream.getReader())) {
        const trimmedLine = line.trim().replace(/,$/, '');
        if (trimmedLine !== '[' && trimmedLine !== ']') {
            yield JSON.parse(trimmedLine);
        }
    }
}
// msg cache
let messageCache = {};
const lsMessageCache = localStorage.getItem("messageCache");
if (typeof lsMessageCache == "string")
    messageCache = JSON.parse(lsMessageCache);
// real shtuff
const chatId = location.pathname.match(/(?<=chats\/)[a-zA-Z0-9_-]*(?=\/*)/).toString();

async function getChatInfo() {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/info`, {}, true);
}
async function getCharacterInfo(charId) {
    return await window.makeAuthenticatedRequest(`/api/characters/${charId}/info`, {}, true);
}
async function getAllChats() {
    return await window.makeAuthenticatedRequest(`/api/chats`, {}, true);
}
async function clearChatHistory() {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/reset`, { method: "POST" }, true);
}
async function addCharacterToChat(charId) {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/setCharacter`, {
        method: "POST",
        body: JSON.stringify({ characterId: charId })
    }, true);
}
async function publishChat(isPublic) {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/publish`, {
        method: "POST",
        body: JSON.stringify({ isPublic })
    }, true);
}
async function setFilterEnabled(doEnable) {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/setFilterEnabled`, {
        method: "POST",
        body: JSON.stringify({ enabled: doEnable ? "on" : "off" })
    }, true);
}
async function updateMessage(messageId, properties) {
    return await makeAuthenticatedRequest(`/api/chats/${chatId}/updateMessage`, {
        method: "POST",
        body: JSON.stringify({ messageId, properties })
    }, true);
}

const contentArea = document.querySelector("div.content-area");
const chatList = document.querySelector("#chat-list");

const chatNameLabel = document.querySelector("#chat-name");
const chatMsgCountLabel = document.querySelector("#chat-msg-count");

const filterStatusText = document.querySelector("#filter-status-text");

const displayNameInput = document.querySelector("#display-name-input");
const saveDisplayNameButton = document.querySelector("#display-name-save");
saveDisplayNameButton.addEventListener("click", async () => {
    let displayName = displayNameInput.value;
    if (typeof displayName != "string")
        return;

    displayName = displayName.trim();
    if (displayName.length <= 0)
        return;

    showLoadingOverlay();

    const { success } = await makeAuthenticatedRequest(`/api/chats/${chatId}/edit`, {
        method: "POST",
        body: JSON.stringify({ displayName })
    }, true);

    if (!success)
        alert("Failed to set name");
    
    closeSettingsModal();
    await doChatSetup();

    hideLoadingOverlay();
});

const outdatedWarning = document.querySelector("#outdated-warning");
const ignoreOutdatedWarning = document.querySelector("#ignore-outdated-char");

let lsIgnoredWarnings = localStorage.getItem("ignoredWarnings");
let ignoredWarnings = (typeof lsIgnoredWarnings == "string") ? JSON.parse(lsIgnoredWarnings) : [];

let myName = "";
let myProfilePicture = "";
let myId = "";

let isFilterEnabled;

let botName = "";
let botProfilePicture = "";
let botId = "";

let chatMessageCount = 0;

let lastUserMessageId;
let lastUserMessagePrompt;

async function doChatSetup() {
    await waitForCachedState();

    showLoadingOverlay();

    if (cachedState) {
        myName = cachedState.displayName;
        myProfilePicture = cachedState.profilePictureURL;
        myId = cachedState.id;
    }

    const { success, error, chatData } = await getChatInfo();
    console.log("Current chat:", chatData);

    if (!success) {
        console.error(error);

        window.location = "/chats";
        return;
    }

    chatNameLabel.innerText = chatData.name;
    displayNameInput.value = chatData.name;

    isFilterEnabled = chatData.isFilterEnabled;
    filterStatusText.innerText = isFilterEnabled ? "Disable" : "Enable";

    const { displayName, avatarURL, version: characterVersionId } = chatData.cachedCharacterData;

    botName = displayName;
    botProfilePicture = avatarURL;
    botId = chatData.activeCharacterId;

    chatList.innerHTML = "";

    let isFirst = true;

    const { messages, activeCharacterId } = chatData;
    if (typeof messages == "object") {
        if (messages.length <= 0)
            location.reload();

        for (const message of messages.reverse()) {
            const authorId = message.authorId;
            if ((message.authorType == "ai") && (authorId != activeCharacterId))
                continue;

            const customLabel = message.customLabel;

            const isSelfAuthor = authorId == myId;

            const msg = createMessage({
                id: message.id,
                displayName: isSelfAuthor ? myName : botName,
                avatarURL: isSelfAuthor ? myProfilePicture : botProfilePicture,
                text: message.text,
                authorId,
                isFiltered: message.isFiltered,
                failed: false,
                timestamp: message.timestamp,
                customLabel,
                moods: message.moods,
                isFirst,
                image: message.image,
                selectedImageIndex: message.selectedImageIndex
            });

            isFirst = false;

            if (isSelfAuthor) {
                lastUserMessageId = message.id;
                lastUserMessagePrompt = msg.messageTextNode.innerText;
            }

            const prevUserMessageId = lastUserMessageId;
            msg?.deleteMessageButton?.addEventListener("click", () => deleteMessage(prevUserMessageId));
        }
    }

    setTimeout(async () => {
        try {
            const { success, characterData, error } = await getCharacterInfo(activeCharacterId);
            console.log("fetched char data:", characterData);
            if (!success)
                return console.error("failed to get char info:", error);
            
            const { id, updateId } = characterData;
            if (characterVersionId != updateId) {
                console.log("using outdated version of character!");
                if (!ignoredWarnings.find(w => w == characterVersionId)) {
                    outdatedWarning.style.display = "";
                    ignoreOutdatedWarning.onclick = () => {
                        ignoredWarnings.push(characterVersionId);
                        localStorage.setItem("ignoredWarnings", JSON.stringify(ignoredWarnings));
                        outdatedWarning.style.display = "none";
                    }
                }
            } else {
                outdatedWarning.style.display = "none";
            }
        } catch(err) {
            console.error("failed to get char info:", err);
        }
    }, 0);
    
    setTimeout(() => contentArea.scrollTo(0, contentArea.scrollHeight + 100000), 1e3);

    hideLoadingOverlay();

    const filterToggleButton = document.querySelector("#filter-toggle-btn");
    if (!filterToggleButton || !cachedState.birthdate || ((Date.now() - cachedState.birthdate) < 567_648_000_000))
        filterToggleButton.setAttribute("disabled", true);
    else {
        filterToggleButton.removeAttribute("disabled");
        filterToggleButton.addEventListener("click", async () => {
            if (!confirm("Are you sure? You may see questionable/objectionable content produced by the AI if you continue. The chat history will also be cleared."))
                return;
            showLoadingOverlay();
            const { success, error } = await setFilterEnabled(!isFilterEnabled);
            if (success)
                closeSettingsModal();
            else {
                alert(error);
                console.error("Failed to toggle filter:", error);
            }
            hideLoadingOverlay();
        });
    }
}
waitForCachedState().then(doChatSetup);

const footer = document.querySelector(".content-area-footer");

async function sendMessage() {
    if (typeof textBar.innerText != "string")
        return;
    
    const text = textBar.innerText.trim();
    if (text.length <= 0)
        return;

    lastUserMessagePrompt = text;

    textBar.innerText = "";
    textBar.disabled = true;
    textBar.contentEditable = false;
    footer.style.filter = "blur(0.5vh)";

    console.log("sending message:", text);
    // create self messsage
    const userMessage = createMessage({
        displayName: myName,
        avatarURL: myProfilePicture,
        text,
        authorId: myId,
        failed: false,
        timestamp: Date.now(),
        isPending: false
    });
    // send bot message
    const botMessage = createMessage({
        id: "",
        displayName: botName,
        avatarURL: botProfilePicture,
        text: "<em>Thinking</em>&nbsp;<img src=\"/assets/icons/thinking.svg\" class=\"thinking-dots\">",
        authorId: botId,
        isFiltered: false,
        failed: false,
        timestamp: Date.now(),
        isPending: true
    });

    let imgLoadingStatus;

    let userMessageId;
    let botMessageId;

    let isSuccess = true;
    let errorType;

    await window.makeAuthenticatedRequest(`/api/chats/${chatId}/inference`, {
        method: "POST",
        body: JSON.stringify({ text })
    })
        .then(async (response) => {
            if (response.status != 200) {
                const { success, error } = await response.json();
                console.log("inference failed with reason:", error);

                errorType = "ERROR";

                if (userMessage) {
                    userMessage.messageTextNode.classList = "chat-message-filtered";
                    userMessage.deleteMessageButton.remove();
                }

                botMessage.container.remove();

                alert("Inference failed: " + error);
                return;
            }

            const failed = false;
            // sanity check
            if (failed) {
                textBar.innerText = text;
                return;
            }
            // read incoming stream
            try {
                for await (const dataChunk of parseJsonStream(response.body)) {
                    //console.log("read msg chunk:", dataChunk);

                    let { messageObject, error: didError, message: errorMessage } = dataChunk;

                    if (typeof messageObject == "object") {
                        let { text, authorType, authorId, isFiltered, timestamp, id, moods, image, isAwaitingImageGeneration, imageGenerationETA } = messageObject;

                        if (isAwaitingImageGeneration) {
                            console.log("waiting for image...");
                            if (!imgLoadingStatus)
                                imgLoadingStatus = addImageLoadingStatusToMessage(botMessage.contentContainer);
                            else if (typeof imageGenerationETA == "number")
                                imgLoadingStatus.loadingText.innerHTML = `Generating image (${Math.floor(imageGenerationETA)}s)&nbsp;`;
                        } else if (typeof image == "object") {
                            console.log("got image:", image);
                            addImagesToMessage(botMessage.contentContainer, messageObject);
                            if (imgLoadingStatus)
                                imgLoadingStatus.loadingContainer.remove();
                        }

                        if (authorId == botId) {
                            botMessageId = id;
                            if (isFiltered) {
                                isSuccess = false;

                                if (typeof botMessage.messageButtonsContainer == "object")
                                    botMessage.messageButtonsContainer.remove();

                                console.warn("message hit filter");

                                errorType = "FILTERED";

                                const childrenParagraphs = botMessage?.messageTextNode?.children;
                                if (childrenParagraphs)
                                    for (const p of childrenParagraphs)
                                        if (!p?.classList?.value?.includes("error-message"))
                                            p.classList = "chat-message-filtered";

                                const filterErrorNode = createNode("p", { innerText: text }, [ "error-message" ]);
                                botMessage.messageTextNode.appendChild(filterErrorNode);
                            } else {
                                isSuccess = true;
                                botMessage.messageTextNode.classList = "chat-message-text";
                                botMessage.messageTextNode.innerHTML = text;
                                if ((typeof moods == "object") && (moods.length >= 1))
                                    botMessage.messageFooterNode.innerHTML = `<p>Mood: ${moods.join(", ")}</p>`;
                            }
                            contentArea.scrollTo(0, contentArea.scrollHeight + 100000);
                        } else if (authorId == myId) {
                            userMessageId = id;
                            if (userMessage) {
                                userMessage.messageTextNode.innerHTML = text;
                            }
                            contentArea.scrollTo(0, contentArea.scrollHeight + 100000);
                        } else {
                            console.warn("ignoring msg for unknown author:", authorId);
                            continue;
                        }
                    }

                    if (didError) {
                        if (isSuccess && (typeof messageObject != "object"))
                            botMessage.messageTextNode.innerHTML = "<p>Error during inferencing</p>";
                        
                        isSuccess = false;
                        errorType = "ERROR";

                        if (typeof botMessage.messageButtonsContainer == "object")
                            botMessage.messageButtonsContainer.remove();

                        console.error("error occurred:", errorMessage);

                        const childrenParagraphs = botMessage?.messageTextNode?.children;
                        if (childrenParagraphs)
                            for (const p of childrenParagraphs)
                                if (!p?.classList?.value?.includes("error-message"))
                                    p.classList = "chat-message-filtered";

                        const filterErrorNode = createNode("p", { innerText: errorMessage }, ["error-message"]);
                        botMessage.messageTextNode.classList = "chat-message-text";            
                        botMessage.messageTextNode.appendChild(filterErrorNode);

                        continue;
                    }
                }
            } catch (err) {
                console.error(err);

                errorType = "ERROR";

                alert(err.toString());
            }
        })
        .catch((err) => {
            console.error(err);

            if (userMessage) {
                userMessage.metaDataNode.classList = "chat-message-error";
                userMessage.metaDataNode.innerText = "ERROR";
            }
            
            alert(err.toString());
        });
    console.log("received msg end");

    if (isSuccess) {
        lastUserMessageId = userMessageId;
        
        if (userMessage)
            userMessage?.deleteMessageButton?.addEventListener("click", () => deleteMessage(userMessageId));
        if (botMessage)
            botMessage?.deleteMessageButton?.addEventListener("click", () => deleteMessage(userMessageId));
    } else {
        botMessage.metaDataNode.classList = "chat-message-error";
        botMessage.metaDataNode.innerText = (typeof errorType == "string") ? errorType : "ERROR";

        textBar.innerText = text;
    }

    textBar.disabled = false;
    textBar.contentEditable = true;
    textBar.focus();
    footer.style.filter = "none";

    // autoscroll
    contentArea.scrollTo(0, contentArea.scrollHeight + 100000);

    return;
}

function timestampToString(timestamp) {
    if (typeof timestamp != "number")
        timestamp = Date.now();

    const today = new Date();

    const timePoint = new Date(timestamp);
    const pointDateString = timePoint.toLocaleDateString();
    const pointTimeString = timePoint.toLocaleTimeString([], { timeStyle: "short" });

    if (today.toLocaleDateString() == pointDateString)
        return pointTimeString;
    else
        return pointDateString;
}

async function deleteMessage(messageId) {
    if (!confirm("Are you sure?"))
        return;

    console.log(`DELETE message ${messageId}`);
    showLoadingOverlay();
    const { success, error: errorMessage } = await makeAuthenticatedRequest(`/api/chats/${chatId}/deleteMessage`, {
        method: "POST",
        body: JSON.stringify({ messageId })
    }, true);
    if (success)
        await doChatSetup();
    else {
        console.error("failed to delete:", errorMessage);
        alert(errorMessage);
    }
    hideLoadingOverlay();
}
async function regenerateMessage(messageId, text) {
    console.log(`regenerate ${messageId} with prompt:`, text);
    if (!messageId || !text)
        return;

    showLoadingOverlay();
    const { success: deleteSuccess, error: deleteErrorMessage } = await makeAuthenticatedRequest(`/api/chats/${chatId}/deleteMessage`, {
        method: "POST",
        body: JSON.stringify({ messageId })
    }, true);

    await doChatSetup();
    hideLoadingOverlay();

    if (!deleteSuccess) {
        console.error("failed to delete:", deleteErrorMessage);
        alert(deleteErrorMessage);
    } else {
        textBar.innerText = text;
        await sendMessage();
    }
}

function addImageLoadingStatusToMessage(container) {
    let loadingContainer = createNode("span", {}, [ "chat-message-loading" ]);
    let loadingText = createNode("em", { innerHTML: "Generating image&nbsp;" }, []);
    loadingContainer.appendChild(loadingText);
    let loadingImg = createNode("img", { src: "/assets/icons/thinking.svg" }, [ "thinking-dots" ]);
    loadingContainer.appendChild(loadingImg);
    container.appendChild(loadingContainer);
    return { loadingContainer, loadingText };
}

function addImagesToMessage(container, messageData, startIndex) {
    const { image: imageData, id: messageId, selectedImageIndex } = messageData;
    if (typeof imageData != "object")
        return;
    const {
        prompt,
        imageCandidates,
        error
    } = imageData;

    let currentImage = (typeof startIndex == "number") ? startIndex : 0;
    if (typeof selectedImageIndex == "number")
        currentImage = selectedImageIndex;
    
    const didError = (typeof imageCandidates != "object") || (imageCandidates.length <= 0);
    if (didError)
        if (error)
            console.error("img gen failed with reason:", error, data);
        else
            return;
    
    let imgContainer = createNode("span", {}, [ didError ? "chat-message-images-error" : "chat-message-images-success", "chat-message-images" ]);

    let buttonsContainer = createNode("div", {}, []);
    let prevButton = createNode("i", {}, [ "fa-solid", "fa-chevron-left" ]);
    buttonsContainer.appendChild(prevButton);
    let nextButton = createNode("i", { style: "right: 0;" }, [ "fa-solid", "fa-chevron-right" ]);
    buttonsContainer.appendChild(nextButton);
    imgContainer.appendChild(buttonsContainer);
    let img = createNode("img", { src: !didError ? imageCandidates[currentImage] : "/assets/img/blank.png" }, []);
    imgContainer.append(img);
    
    if (!didError) {
        prevButton.addEventListener("click", () => {
            currentImage = Math.max(currentImage - 1, 0);
            img.src = imageCandidates[currentImage];
            updateMessage(messageId, { selectedImageIndex: currentImage });
        });
        nextButton.addEventListener("click", () => {
            currentImage = Math.min(currentImage + 1, imageCandidates.length - 1);
            img.src = imageCandidates[currentImage];
            updateMessage(messageId, { selectedImageIndex: currentImage });
        });
    }

    container.appendChild(imgContainer);

    let promptContainer = createNode("div", { style: "justify-content: center;" }, []);
    let imagePromptNode = createNode("span", { innerText: didError ? (error || "Failed") : prompt }, []);
    promptContainer.appendChild(imagePromptNode);
    imgContainer.appendChild(promptContainer);

    return { img, prevButton, nextButton };
}

function createMessage(data) {
    chatMsgCountLabel.innerText = formatNumberToHumanReadable(chatMessageCount++, 1);

    const {
        displayName: name,
        isPending,
        avatarURL,
        authorType,
        text,
        authorId,
        failed,
        timestamp,
        moods,
        id,
        isFiltered,
        customLabel,
        isFirst,
        image
    } = data;
    let isGeneralFailure = failed || isFiltered;
    if ((typeof timestamp != "number") || (typeof name != "string") || (typeof avatarURL != "string") || (typeof authorId != "string") || (typeof text != "string")) {
        console.error("invalid data:", data);
        return;
    }
    let container = createNode("tr", {}, ["chat-list-item"]);
    let pfpContainer = createNode("td", {}, ["chat-message-image"]);
    let avatarNode = createNode("img", { src: avatarURL, alt: "pfp" }, ["chat-message-image"]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);
    let contentContainer = createNode("td", {}, ["chat-message-extra"]);

    let headerContainer = createNode("div", {}, ["chat-message-header"]);

    let usernameNode = createNode("span", { innerText: name }, ["chat-message-name"]);
    headerContainer.appendChild(usernameNode);

    if (authorId != myId) {
        let labelNode = createNode("span", {
            innerText: (typeof customLabel == "string") ? customLabel : "c.diy"
        }, [
            "chat-message-label",
            isFirst ? "user-label" : "bot-label"
        ]);
        headerContainer.appendChild(labelNode);
    }

    let metaDataNode = createNode("span", {
        innerText: isGeneralFailure ? (isFiltered ? "FILTERED" : "ERROR") : timestampToString(timestamp)
    }, [
        isGeneralFailure ? "chat-message-error" : "chat-message-timestamp"
    ]);
    headerContainer.appendChild(metaDataNode);

    contentContainer.appendChild(headerContainer);
    
    let messageButtonsContainer;
    let regenerateMessageButton;
    let deleteMessageButton;
    if (!isGeneralFailure && !isFirst) {
        messageButtonsContainer = createNode("div", {}, ["chat-message-menu"]);
        if (authorId != myId) {
            regenerateMessageButton = createNode("span", {}, [ "chat-message-button", "regenerate-message-button" ]);
            let regenerateMessageIcon = createNode("i", { style: "font-weight: 600;" }, [ "fa-solid", "fa-arrow-rotate-right", "fa-btn" ]);
            regenerateMessageButton.addEventListener("click", () => regenerateMessage(lastUserMessageId, lastUserMessagePrompt));
            regenerateMessageButton.appendChild(regenerateMessageIcon);
            messageButtonsContainer.appendChild(regenerateMessageButton);
        }
        deleteMessageButton = createNode("span", {}, [ "chat-message-button", "delete-message-button" ]);
        let deleteMessageIcon = createNode("i", {}, [ "fa-solid", "fa-trash-can", "fa-btn" ]);
        deleteMessageButton.appendChild(deleteMessageIcon);
        messageButtonsContainer.appendChild(deleteMessageButton);
        contentContainer.appendChild(messageButtonsContainer);
    }

    let messageTextNode = createNode("span", {
        innerHTML: text
    }, [
        isPending ? "chat-message-loading" : "chat-message-text"
    ]);
    contentContainer.appendChild(messageTextNode);

    let messageFooterNode = createNode("span", {
        innerHTML: ((typeof moods == "object") && (moods.length >= 1)) ? (`<p>Mood: ${moods.join(", ")}</p>`) : ""
    }, [
        "chat-message-footer"
    ]);
    contentContainer.appendChild(messageFooterNode);

    container.appendChild(contentContainer);
    chatList.append(container);
    // has img?
    if (typeof image == "object") {
        addImagesToMessage(contentContainer, data);
    }
    // autoscroll
    contentArea.scrollTo(0, contentArea.scrollHeight + 100000);

    return { container, contentContainer, messageTextNode, metaDataNode, messageButtonsContainer, deleteMessageButton, messageFooterNode };
}
//////////////////
const chatHelperOverlay = document.querySelector("#chat-helper-overlay");
const closeOverlayButton = document.querySelector("#chat-helper-close");

function closeSettingsModal() {
    chatHelperOverlay.style.display = "none";
}
closeOverlayButton.addEventListener("click", closeSettingsModal);
function openChatSettingsModal() {
    chatHelperOverlay.style.display = "";
}

const downloadChatButton = document.querySelector("#download-chat-btn");
downloadChatButton.addEventListener("click", async () => {
    showLoadingOverlay();
    try {
        const { chatData } = await getChatInfo();
        if (chatData) {
            const { messages, id: chatId } = chatData;
            if (typeof messages != "object") {
                alert("Failed to load chat messages");
            } else {
                const fileName = "cdiy_export_" + chatId + "_" + Date.now().toString();
                const chosenFile = await window.showSaveFilePicker({
                    types: [
                        {
                            description: "JSON file",
                            accept: { "application/json": [".json"] },
                        },
                    ],
                    suggestedName: fileName
                }).catch(() => undefined);
                if (chosenFile) {
                    const writableStream = await chosenFile.createWritable();
                    await writableStream.write(JSON.stringify(messages, undefined, 2));
                    await writableStream.close();
                    closeSettingsModal();
                }
            }
        } else {
            alert("Failed to load chat data");
        }
    } finally {
        hideLoadingOverlay();
    }
});

const resetChatButton = document.querySelector("#reset-chat-btn");
resetChatButton.addEventListener("click", async () => {
    if (confirm("Are you sure? If you continue, the chat history will be cleared and the character will forget everything")) {
        showLoadingOverlay();
        await clearChatHistory();
        closeSettingsModal();
        chatMessageCount = 0;
        await doChatSetup();
        hideLoadingOverlay();
        localStorage.removeItem("messageCache");
    }
});

async function updateChar() {
    if (botId && confirm("Are you sure? If you continue, the chat history will be cleared and the character will forget everything")) {
        showLoadingOverlay();
        await addCharacterToChat(botId);
        closeSettingsModal();
        chatMessageCount = 0;
        await doChatSetup();
        hideLoadingOverlay();
    }
}
const updateChatCharButton = document.querySelector("#update-chat-btn");
updateChatCharButton.addEventListener("click", updateChar);
const fixOutdatedCharButton = document.querySelector("#fix-outdated-char");
fixOutdatedCharButton.addEventListener("click", updateChar);

const isPublicToggle = document.querySelector("#share-chat-public");
const shareChatButton = document.querySelector("#share-chat-btn");
shareChatButton.addEventListener("click", async () => {
    if (botId) {
        if (isPublicToggle.checked && (!confirm("Are you sure you want to share this chat publicly? Anyone with the link will be able to read your messages.")))
            return;
        showLoadingOverlay();

        const { success, error, savedChatId } = await publishChat(isPublicToggle.checked);
        if (!success) {
            console.error("Failed to publish!", error);
            alert("Publish failed with error: " + error);
        } else {
            window.location = `/archive/${savedChatId}`;
        }

        closeSettingsModal();
        hideLoadingOverlay();
    }
});

/*const saveOptionsButton = document.querySelector("#save-options-btn");
saveOptionsButton.addEventListener("click", () => {

    closeSettingsModal();
});*/


//////////////

const FUNNY_PLACEHOLDERS = [
    "Awoo here~",
    "Say something, I'm giving up on you...",
    "Speak your mind",
    "Say geronimo",
    "[object Object]",
    "Say it ain't so"
];

const textBarPlaceholder = document.getElementById("placeholder");
const textBarPreview = document.getElementById("textbarpreview");
const textBar = document.getElementById("textbar");
textBarPlaceholder.innerText = FUNNY_PLACEHOLDERS[randInt(0, FUNNY_PLACEHOLDERS.length - 1)];
let isFocused = false;
function updateTextBarFocus(hasFocus) {
    isFocused = hasFocus;
    if (textBar.innerText.trim().length >= 1)
        textBarPlaceholder.style.display = "none";
    else
        textBarPlaceholder.style.display = "";
}
textBar.addEventListener("focus", () => updateTextBarFocus(true));
textBar.addEventListener("blur", () => updateTextBarFocus(false));
document.addEventListener("keypress", (e) => {
    e = e || window.event;
    if (!isFocused && (e.code != "Enter")) {
        textBar.focus();
    }
});

textBarPlaceholder.addEventListener("click", () => textBar.focus());

document.getElementById("submit-btn").addEventListener("click", sendMessage);
document.getElementById("settings-btn").addEventListener("click", openChatSettingsModal);

/*textBarPreview.addEventListener("focus", e => {
    e.preventDefault();
    textBar.focus();
});*/

let waitingForReply = false;
textBar.addEventListener("keydown", async e => {
    if (e.code == "Enter") {
        if (!e.shiftKey) {
            e.preventDefault();
            if (!waitingForReply) {
                waitingForReply = true;
                await sendMessage();
                waitingForReply = false;
            }
        }
    }
    updateTextBarFocus(true);
});
/*const mdConverter = new showdown.Converter();
textBar.addEventListener("keyup", e => {
    textBarPreview.innerHTML = mdConverter.makeHtml(textBar.innerText) + "<span class=\"blinking-cursor\">|</span>";
});*/