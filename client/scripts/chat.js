function formatImageCss(source) {
    return "width:300px;height:225px;background-image:url(" + source + ");background-size:300px 225px;";
}
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
// real shtuff
const chatId = location.pathname.match(/[a-zA-Z0-9_-]*$/).toString();

async function getChatInfo() {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/info`, {}, true);
}
async function getAllChats() {
    return await window.makeAuthenticatedRequest(`/api/chats`, {}, true);
}
async function clearChatHistory() {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/reset`, { method: "POST" }, true);
}
async function setFilterEnabled(doEnable) {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/setFilterEnabled`, {
        method: "POST",
        body: JSON.stringify({ enabled: doEnable ? "on" : "off" })
    }, true);
}

const contentArea = document.querySelector("div.content-area");
const chatList = document.querySelector("#chat-list");

const chatNameLabel = document.querySelector("#chat-name");
const chatMsgCountLabel = document.querySelector("#chat-msg-count");

const filterStatusText = document.querySelector("#filter-status-text");

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

    isFilterEnabled = chatData.isFilterEnabled;
    filterStatusText.innerText = isFilterEnabled ? "Disable" : "Enable";

    botName = chatData.name;
    botProfilePicture = chatData.thumbnailURL;
    botId = chatData.activeCharacterId;

    chatList.innerHTML = "";

    const { messages, activeCharacterId } = chatData;
    if (typeof messages == "object") {
        if (messages.length <= 0)
            location.reload();

        for (const message of messages.reverse()) {
            const authorId = message.authorId;
            if ((message.authorType == "ai") && (authorId != activeCharacterId))
                continue;

            const isSelfAuthor = authorId == myId;

            const msg = createMessage({
                id: message.id,
                displayName: isSelfAuthor ? myName : chatData.name,
                avatarURL: isSelfAuthor ? myProfilePicture : chatData.thumbnailURL,
                text: message.text,
                authorId,
                isFiltered: message.isFiltered,
                failed: false,
                timestamp: message.timestamp
            });

            if (isSelfAuthor) {
                lastUserMessageId = message.id;
                lastUserMessagePrompt = msg.messageTextNode.innerText;
            }
            
            msg?.deleteMessageButton?.addEventListener("click", () => deleteMessage(lastUserMessageId));
        }
    }

    hideLoadingOverlay();

    const filterToggleButton = document.querySelector("#filter-toggle-btn");
    if (!filterToggleButton || !cachedState.birthdate || ((Date.now() - cachedState.birthdate) < 567_648_000_000))
        filterToggleButton.setAttribute("disabled", true);
    else {
        filterToggleButton.removeAttribute("disabled");
        filterToggleButton.addEventListener("click", async () => {
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

async function sendMessage() {
    const text = textBar.value;

    lastUserMessagePrompt = text;

    textBar.value = "";
    textBar.disabled = true;

    console.log("sending message:", text);
    // create self messsage
    const userMessage = createMessage({
        displayName: myName,
        avatarURL: myProfilePicture,
        text,
        authorId: myId,
        failed: false,
        timestamp: Date.now()
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

    let userMessageId;
    let botMessageId;

    let isSuccess = true;

    await window.makeAuthenticatedRequest(`/api/chats/${chatId}/inference`, {
        method: "POST",
        body: JSON.stringify({ text })
    })
        .then(async (response) => {
            const failed = false;
            // sanity check
            if (failed) {
                textBar.value = text;
                return;
            }
            // read incoming stream
            try {
                for await (const dataChunk of parseJsonStream(response.body)) {
                    //console.log("read msg chunk:", dataChunk);

                    let { messageObject, error: didError, message: errorMessage } = dataChunk;

                    if (typeof messageObject == "object") {
                        let { text, authorType, authorId, isFiltered, timestamp, id } = messageObject;

                        if (authorId == botId) {
                            botMessageId = id;
                            if (isFiltered) {
                                isSuccess = false;

                                if (typeof botMessage.messageButtonsContainer == "object")
                                    botMessage.messageButtonsContainer.remove();

                                console.warn("message hit filter");

                                botMessage.metaDataNode.classList = "chat-message-error";
                                botMessage.metaDataNode.innerText = "FILTERED";

                                const childrenParagraphs = botMessage?.messageTextNode?.children;
                                if (childrenParagraphs)
                                    for (const p of childrenParagraphs)
                                        if (!p?.classList?.value?.includes("error-message"))
                                            p.classList = "chat-message-filtered";

                                const filterErrorNode = createNode("p", { innerText: text }, [ "error-message" ]);
                                botMessage.messageTextNode.appendChild(filterErrorNode);
                            } else {
                                botMessage.messageTextNode.innerHTML = text;
                            }

                            contentArea.scrollTo(0, contentArea.scrollHeight + 100000);
                        } else if (authorId == myId) {
                            userMessageId = id;
                            userMessage.messageTextNode.innerHTML = text;
                            contentArea.scrollTo(0, contentArea.scrollHeight + 100000);
                        } else {
                            console.warn("ignoring msg for unknown author:", authorId);
                            continue;
                        }
                    }

                    if (didError) {
                        isSuccess = false;

                        if (typeof botMessage.messageButtonsContainer == "object")
                            botMessage.messageButtonsContainer.remove();

                        console.error("error occurred:", errorMessage);

                        botMessage.metaDataNode.classList = "chat-message-error";
                        botMessage.metaDataNode.innerText = "ERROR";

                        const childrenParagraphs = botMessage?.messageTextNode?.children;
                        if (childrenParagraphs)
                            for (const p of childrenParagraphs)
                                if (!p?.classList?.value?.includes("error-message"))
                                    p.classList = "chat-message-filtered";

                        const filterErrorNode = createNode("p", { innerText: errorMessage }, ["error-message"]);
                        botMessage.messageTextNode.appendChild(filterErrorNode);

                        continue;
                    }
                }
            } catch (err) {
                console.error(err);
                botMessage.metaDataNode.classList = "chat-message-error";
                botMessage.metaDataNode.innerText = "ERROR";
                alert(err.toString());
            }
        })
        .catch((err) => {
            console.error(err);
            userMessage.metaDataNode.classList = "chat-message-error";
            userMessage.metaDataNode.innerText = "ERROR";
            alert(err.toString());
        });
    console.log("received msg end");

    if (isSuccess) {
        lastUserMessageId = userMessageId;
        
        userMessage?.deleteMessageButton?.addEventListener("click", () => deleteMessage(userMessageId));
        botMessage?.deleteMessageButton?.addEventListener("click", () => deleteMessage(userMessageId));
    }

    textBar.disabled = false;

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
        textBar.value = text;
        await sendMessage();
    }
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
        id,
        isFiltered
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
    if (!isGeneralFailure) {
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
    }, ["chat-message-text"]);
    contentContainer.appendChild(messageTextNode);
    container.appendChild(contentContainer);
    chatList.append(container);
    // autoscroll
    contentArea.scrollTo(0, contentArea.scrollHeight + 100000);

    return { container, messageTextNode, metaDataNode, messageButtonsContainer, deleteMessageButton };
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
                const fileName = "cidy_export_" + chatId + "_" + Date.now().toString();
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
        await doChatSetup();
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

const textBar = document.getElementById("textbar");
textBar.placeholder = FUNNY_PLACEHOLDERS[randInt(0, FUNNY_PLACEHOLDERS.length - 1)];
let isFocused = false;
textBar.onfocus = () => isFocused = true;
textBar.onblur = () => isFocused = false;
document.addEventListener("keypress", (e) => {
    if (!isFocused) {
        e = e || window.event;
        textBar.focus();
    }
});

document.getElementById("submit-btn").addEventListener("click", sendMessage);
document.getElementById("settings-btn").addEventListener("click", openChatSettingsModal);

let waitingForReply = false;
textBar.onkeyup = (async e => {
    if (e.keyCode == 13 && !waitingForReply) {
        await sendMessage();
    }
});