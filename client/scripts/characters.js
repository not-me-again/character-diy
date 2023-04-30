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

const charQuotaData = document.querySelector("#char-quota-data");

async function doCharactersSetup() {
    showLoadingOverlay();
    const { chars } = await getAllCharacters();
    hideLoadingOverlay();
    console.log("Char list:", chars);
    
    for (const char of chars)
        displayCharacter(char);

    const { quotas } = await waitForCachedState();
    const remainingCharSlots = quotas.maxAllowedCharacters - chars.length;
    if (remainingCharSlots <= 0) {
        charQuotaData.classList = "quota-data-0";
        newButton.remove();
    } else {
        charQuotaData.classList = "quota-data";
    }

    charQuotaData.innerText = remainingCharSlots;
}
doCharactersSetup();

const addCharName = document.querySelector("#add-char-name");

async function doAddCharSetup(charId) {
    const { success, error, characterData } = await getCharacterInfo(charId);
    if (!success) {
        console.error("Failed to fetch character info for", charId, "with reason:", error);
        return;
    }
    handleChatOpen(characterData);
}

const addCharacterId = location.query["add-character"];
if (typeof addCharacterId == "string")
    doAddCharSetup(addCharacterId);

const chatList = document.querySelector("#chat-list");
const chatHelperOverlay = document.querySelector("#chat-helper-overlay");
const chatHelperCloseButton = document.querySelector("#chat-helper-close");

let selectedCharId = undefined;

chatHelperCloseButton.addEventListener("click", () => {
    chatHelperOverlay.style.display = "none";
    selectedCharId = undefined;
});

let newChatButton;

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

async function handleCharShare(charData) {
    if (!charData)
        return;

    const { id: charId, isPublic } = charData;
    if (typeof charId != "string")
        return;

    if (!isPublic)
        return alert("This character cannot be shared because it has not been made public.");

    const shareURL = `${location.protocol}//${location.hostname}/characters/${charId}/view`;
    //`${location.protocol}//${location.hostname}${location.pathname}?add-character=${charId}`;
    console.log("share url:", shareURL);
    await navigator.clipboard.writeText(shareURL);
    alert("Share URL copied to clipboard");
}

async function handleCharDelete(charData) {
    if (!charData)
        return;

    const { id: charId } = charData;
    if (typeof charId != "string")
        return;

    if (!confirm("Are you sure? Deleting a character is permanent!"))
        return;

    showLoadingOverlay();

    const { success } = await makeAuthenticatedRequest(`/api/characters/${charId}/delete`, { method: "POST" }, true);

    hideLoadingOverlay();

    if (!success)
        alert("Failed to delete character");
    else
        location.reload();
}

const chatNewItemHTML = document.querySelector("tr.chat-new-item").innerHTML;

const chatQuotaData = document.querySelector("#chat-quota-data");

let chats = undefined;
async function handleChatOpen(charData) {
    console.log("Char:", charData);

    const { id: charId, displayName: charName } = charData;
    selectedCharId = charId;

    if (!charId)
        return;

    if (!chats) {
        showLoadingOverlay();
        const data = await getAllChats();
        if (typeof data.chats != "object") {
            console.error("failed to load chats", data);
            alert("Failed to load chats");
        } else
            chats = data.chats;
        
        hideLoadingOverlay();
    }
    
    chats.sort((a, b) => {
        if (a.activeCharacterId == charId)
            return chats.length;
        else if (b.activeCharacterId == charId)
            return -chats.length;
            
        return a.messageCount - b.messageCount;
    });

    const { quotas } = await waitForCachedState();
    const remainingChatSlots = quotas.maxAllowedChats - chats.length;

    console.log("Chat list:", chats);

    addCharName.innerText = charName;
    
    chatList.innerHTML = chatNewItemHTML;

    newChatButton = document.querySelector("#new-chat-btn");

    if (remainingChatSlots <= 0) {
        newChatButton.remove();
        chatQuotaData.classList = "quota-data-0";
    } else {
        newChatButton.addEventListener("click", async () => {
            console.log("Make new chat for: " + selectedCharId);

            if (!selectedCharId)
                return;
                
            showLoadingOverlay();
            const { success, chat, error } = await newChat(selectedCharId);
            if (success && (typeof chat == "object"))
                window.location = `/chats/${chat.id}`;
            else {
                alert(error);
                location.reload();
            }

            hideLoadingOverlay();
        });
        chatQuotaData.classList = "quota-data";
    }
    chatQuotaData.innerText = remainingChatSlots;
    
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
    const { totalMessageCount, displayName, avatarURL, id, authorId, blurb, isImageGenerating } = charData;
    const messageCount = window.formatNumberToHumanReadable(totalMessageCount, 1);
    let container = createNode("tr", {}, [ "chat-list-item" ]);
    let pfpContainer = createNode("td", {}, [ "chat-bot-image" ]);
    let avatarNode = createNode("img", { src: avatarURL, alt: "pfp" }, [ "chat-bot-image" ]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);
    
    let contentContainer = createNode("td", {}, [ "chat-bot-extra" ]);
    let usernameNode = createNode("span", {}, [ "chat-bot-name" ]);
    let usernameText = createNode("span", { innerText: displayName }, []);
    usernameNode.appendChild(usernameText)
    if (isImageGenerating) {
        let faPaintbrushIconNode = createNode("i", { title: "This character can generate images." }, [ "fa-solid", "fa-paintbrush" ]);
        usernameNode.appendChild(faPaintbrushIconNode);
    }
    contentContainer.appendChild(usernameNode);

    let messageCountNode = createNode("span", { innerText: messageCount }, [ "chat-message-count" ]);
    let faMessageIconNode = createNode("i", {}, [ "fa-regular", "fa-message" ]);
    messageCountNode.appendChild(faMessageIconNode);
    contentContainer.appendChild(messageCountNode);
    let linkButtonContainer = createNode("span", {}, [ "chat-link-button" ]);

    let openButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faOpenIconNode = createNode("i", {}, [ "fa-regular", "fa-comments", "fa-btn" ]);
    openButtonNode.appendChild(faOpenIconNode);
    openButtonNode.addEventListener("click", () => handleChatOpen(charData));

    linkButtonContainer.appendChild(openButtonNode);

    let editButtonNode = createNode("a", { href: `/characters/${id}/edit` }, [ "link-clear" ]);
    let faEditIconNode = createNode("i", {}, [ "fa-regular", "fa-pen-to-square", "fa-btn" ]);
    editButtonNode.appendChild(faEditIconNode);

    linkButtonContainer.appendChild(editButtonNode);

    let deleteButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faDeleteIconNode = createNode("i", {}, [ "fa-regular", "fa-trash-can", "fa-btn" ]);
    deleteButtonNode.appendChild(faDeleteIconNode);
    deleteButtonNode.addEventListener("click", () => handleCharDelete(charData));

    linkButtonContainer.appendChild(deleteButtonNode);

    let shareButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faShareIconNode = createNode("i", {}, [ "fa-regular", "fa-share-from-square", "fa-btn" ]);
    shareButtonNode.appendChild(faShareIconNode);
    shareButtonNode.addEventListener("click", () => handleCharShare(charData));

    linkButtonContainer.appendChild(shareButtonNode);

    contentContainer.appendChild(linkButtonContainer);
    container.appendChild(contentContainer);
    charList.prepend(container);
}