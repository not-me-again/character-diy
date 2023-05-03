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
const chatId = location.pathname.match(/(?<=archive\/)[a-zA-Z0-9_-]*(?=\/*)/).toString();

async function getChatInfo() {
    return await window.makeAuthenticatedRequest(`/api/archive/${chatId}/info`, {}, true);
}

const contentArea = document.querySelector("div.content-area");
const chatList = document.querySelector("#chat-list");

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
    showLoadingOverlay();

    const { success, error, chatData } = await getChatInfo();
    console.log("Current chat:", chatData);

    const { cachedUserData } = chatData;
    if (typeof cachedUserData == "object") {
        myName = cachedUserData.displayName;
        myProfilePicture = cachedUserData.profilePictureURL;
        myId = chatData.ownerId;
    }

    if (!success) {
        console.error(error);
        return;
    }

    const { displayName, avatarURL } = chatData.cachedCharacterData;

    const { activeCharacterId, messages } = chatData;

    botName = displayName;
    botProfilePicture = avatarURL;
    botId = chatData.activeCharacterId;

    chatList.innerHTML = "";

    let isFirst = true;

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
                isFirst,
                image: message.image,
                selectedImageIndex: message.selectedImageIndex
            });

            isFirst = false;

            if (isSelfAuthor) {
                lastUserMessageId = message.id;
                lastUserMessagePrompt = msg.messageTextNode.innerText;
            }
            
            msg?.deleteMessageButton?.addEventListener("click", () => deleteMessage(lastUserMessageId));
        }
    }

    hideLoadingOverlay();
}
doChatSetup();

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

    /*let buttonsContainer = createNode("div", {}, []);
    let prevButton = createNode("i", {}, [ "fa-solid", "fa-chevron-left" ]);
    buttonsContainer.appendChild(prevButton);
    let nextButton = createNode("i", { style: "right: 0;" }, [ "fa-solid", "fa-chevron-right" ]);
    buttonsContainer.appendChild(nextButton);
    imgContainer.appendChild(buttonsContainer);*/
    let img = createNode("img", { src: !didError ? imageCandidates[currentImage] : "/assets/img/blank.png" }, []);
    imgContainer.append(img);
    
    /*if (!didError) {
        prevButton.addEventListener("click", () => {
            currentImage = Math.max(currentImage - 1, 0);
            img.src = imageCandidates[currentImage];
        });
        nextButton.addEventListener("click", () => {
            currentImage = Math.min(currentImage + 1, imageCandidates.length - 1);
            img.src = imageCandidates[currentImage];
        });
    }*/

    container.appendChild(imgContainer);

    let promptContainer = createNode("div", { style: "justify-content: center;" }, []);
    let imagePromptNode = createNode("span", { innerText: didError ? (error || "Failed") : prompt }, []);
    promptContainer.appendChild(imagePromptNode);
    imgContainer.appendChild(promptContainer);

    return { img, /*prevButton, nextButton*/ };
}

function createMessage(data) {
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

    let messageTextNode = createNode("span", {
        innerHTML: text
    }, [
        isPending ? "chat-message-loading" : "chat-message-text"
    ]);
    contentContainer.appendChild(messageTextNode);
    container.appendChild(contentContainer);
    chatList.append(container);
    // has img?
    if (typeof image == "object") {
        addImagesToMessage(contentContainer, data);
    }
    // autoscroll
    contentArea.scrollTo(0, contentArea.scrollHeight + 100000);

    return { container, messageTextNode, metaDataNode };
}