const { query } = location;
let showUpdateSuccessModal = false;
if (query) {
    const { doOnboarding, showUpdateSuccessModal: doShowUpdateSuccessModal } = query;
    showUpdateSuccessModal = doShowUpdateSuccessModal;
    if (doOnboarding)
        localStorage.setItem("onboardingComplete", false);
    if (!localStorage.getItem("onboardingComplete")) {
        // onboard
        console.log("Needs onboarding");
    }
}

// real shtuff

async function getCharacterInfo(charId) {
    return await window.makeAuthenticatedRequest(`/api/characters/${charId}/info`, {}, true);
}
async function getAllCharacters() {
    return await window.makeAuthenticatedRequest(`/api/characters`, {}, true);
}
async function getAllChats() {
    return await window.makeAuthenticatedRequest(`/api/chats`, {}, true);
}
async function newChat(id) {
    return await window.makeAuthenticatedRequest(`/api/createChat`, {
        method: "POST",
        body: JSON.stringify({ characterId: id })
    }, true);
}
async function addCharacterToChat(charId, chatId) {
    return await window.makeAuthenticatedRequest(`/api/chats/${chatId}/setCharacter`, {
        method: "POST",
        body: JSON.stringify({ characterId: charId })
    }, true);
}

const newButton = document.querySelector("#new-btn");
newButton.addEventListener("click", () => {
    window.location = "/characters/new";
});

async function doCharactersSetup() {
    showLoadingOverlay();
    const { chars } = await getAllCharacters();
    hideLoadingOverlay();
    console.log("Char list:", chars);
    
    for (const char of chars)
        displayCharacter(char);

    const { quotas } = await waitForCachedState();
    if (!quotas || chars.length >= quotas.maxAllowedCharacters)
        newButton.remove();
}
doCharactersSetup();

const chatList = document.querySelector("#chat-list");
const chatHelperOverlay = document.querySelector("#chat-helper-overlay");
const chatHelperCloseButton = document.querySelector("#chat-helper-close");
const newChatButton = document.querySelector("#new-chat-btn");

let selectedCharId = undefined;

chatHelperCloseButton.addEventListener("click", () => {
    chatHelperOverlay.style.display = "none";
});

newChatButton.addEventListener("click", async () => {
    if (!selectedCharId)
        return;
    showLoadingOverlay();

    console.log("Make new chat for: " + selectedCharId);
    const { success, chat, error } = await newChat(selectedCharId);
    if (success && (typeof chat == "object"))
        window.location = `/chats/${chat.id}`;
    else
        alert(error);

    hideLoadingOverlay();
});
async function handleSelectChat(data) {
    if (!selectedCharId)
        return;

    const { id: chatId, activeCharacterId } = data;
    if (!chatId || !activeCharacterId)
        return;

    if (activeCharacterId == selectedCharId) {
        window.location = `/chats/${chatId}`;
        return;
    }

    showLoadingOverlay();

    if (confirm("Are you sure? Doing this will delete your chat history! (but will not delete your previous character)")) {
        console.log("Change chatId " + chatId + " character to " + selectedCharId);
        const { success, error } = await addCharacterToChat(selectedCharId, chatId);
        if (success)
            window.location = `/chats/${chatId}`;
        else
            alert(error);
    }

    hideLoadingOverlay();
}

function displayChat(data) {
    if (!selectedCharId)
        return;

    const { messageCount, name, thumbnailURL, id, activeCharacterId } = data;
    if ((typeof messageCount != "number") || (typeof name != "string") || (typeof thumbnailURL != "string") || (typeof id != "string") || (typeof activeCharacterId != "string")) {
        console.log("invalid data:", data);
        return;
    }
    const isSameChar = activeCharacterId == selectedCharId;
    const messageCountNum = window.formatNumberToHumanReadable(messageCount, 1);
    let container = createNode("tr", {}, [ "chat-list-item" ]);
    let pfpContainer = createNode("td", {}, [ "chat-bot-image" ]);
    let avatarNode = createNode("img", { src: thumbnailURL, alt: "pfp" }, [ "chat-bot-image" ]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);
    let contentContainer = createNode("td", {}, [ "chat-bot-extra" ]);
    let usernameNode = createNode("span", { innerText: name }, [ "chat-bot-name" ]);
    contentContainer.appendChild(usernameNode);
    let messageCountNode = createNode("span", {
        innerText: isSameChar ? "This chat is already using this character" : messageCountNum
    }, [ "chat-message-count" ]);
    let faMessageIconNode = createNode("i", {}, [
        isSameChar ? "fa-solid" : "fa-regular",
        isSameChar ? "fa-triangle-exclamation" : "fa-message"
    ]);
    messageCountNode.appendChild(faMessageIconNode);
    contentContainer.appendChild(messageCountNode);
    let chooseButtonContainer = createNode("span", {}, [ "chat-link-button" ]);
    let chooseButton = createNode("span", {
        innerText: isSameChar ? "Open Chat" : "Choose"
    }, [ "chat-choose-button" ]);
    let faChooseIconNode = createNode("i", {}, [
        "fa-regular",
        isSameChar ? "fa-circle-play" : "fa-circle-check",
        "fa-btn"
    ]);
    chooseButton.addEventListener("click", () => handleSelectChat(data));
    chooseButton.appendChild(faChooseIconNode);
    chooseButtonContainer.appendChild(chooseButton);
    contentContainer.appendChild(chooseButtonContainer);
    container.appendChild(contentContainer);
    chatList.prepend(container);
}

const chatNewItemHTML = document.querySelector("tr.chat-new-item").innerHTML;

let chats = undefined;
async function handleChatOpen(charData) {
    console.log("Char:", charData);

    const { id: charId } = charData;
    selectedCharId = charId;

    if (!charId)
        return;

    if (!chats) {
        showLoadingOverlay();
        const data = await getAllChats();
        chats = data.chats;
        hideLoadingOverlay();
    }

    const { quotas } = await waitForCachedState();

    const canCreateNewChat = quotas && (chats.length < quotas.maxAllowedChats);
    newChatButton.display = canCreateNewChat ? "" : "none";

    console.log("Chat list:", chats);
    
    chatList.innerHTML = chatNewItemHTML;
    
    for (const chat of chats)
            displayChat(chat, charId);

    chatHelperOverlay.style.display = "";
}

const charList = document.querySelector("#char-list");
function displayCharacter(charData) {
    /*
        <tr class="chat-list-item">
            <td class="chat-bot-image"><img src="/image/4406207506506a048037.png" class="chat-bot-image"></td>
            <td class="chat-bot-extra">
                <span class="chat-bot-name">Frankenbot</span>
                <span class="chat-message-count">30<i class="fa-regular fa-message"></i></span>
                <span class="chat-link-button">
                    <a class="link-clear" href="/chats/389248723947">
                        <i class="fa-regular fa-circle-play fa-btn"></i>
                    </a>
                </span>
            </td>
        </tr>
    */
    const { totalMessagesCount, displayName, avatarURL, id } = charData;
    const messageCount = window.formatNumberToHumanReadable(totalMessagesCount, 1);
    let container = createNode("tr", {}, [ "chat-list-item" ]);
    let pfpContainer = createNode("td", {}, [ "chat-bot-image" ]);
    let avatarNode = createNode("img", { src: avatarURL, alt: "pfp" }, [ "chat-bot-image" ]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);
    let contentContainer = createNode("td", {}, [ "chat-bot-extra" ]);
    let usernameNode = createNode("span", { innerText: displayName }, [ "chat-bot-name" ]);
    contentContainer.appendChild(usernameNode);
    let messageCountNode = createNode("span", { innerText: messageCount }, [ "chat-message-count" ]);
    let faMessageIconNode = createNode("i", {}, [ "fa-regular", "fa-message" ]);
    messageCountNode.appendChild(faMessageIconNode);
    contentContainer.appendChild(messageCountNode);
    let linkButtonContainer = createNode("span", {}, [ "chat-link-button" ]);

    let editButtonNode = createNode("a", { href: `/characters/${id}/edit` }, [ "link-clear" ]);
    let faEditIconNode = createNode("i", {}, [ "fa-regular", "fa-pen-to-square", "fa-btn" ]);
    editButtonNode.appendChild(faEditIconNode);

    linkButtonContainer.appendChild(editButtonNode);

    let openButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faOpenIconNode = createNode("i", {}, [ "fa-regular", "fa-comments", "fa-btn" ]);
    openButtonNode.appendChild(faOpenIconNode);
    openButtonNode.addEventListener("click", () => handleChatOpen(charData));

    linkButtonContainer.appendChild(openButtonNode);

    contentContainer.appendChild(linkButtonContainer);
    container.appendChild(contentContainer);
    charList.prepend(container);
}