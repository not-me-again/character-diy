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
async function getPopularCharacters() {
    return await window.makeAuthenticatedRequest(`/api/popularCharacters`, {}, true);
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

let myId;
waitForCachedState().then(state => {
    myId = state.id;
});

const charList = document.querySelector("#char-list");

async function doCharactersSetup() {
    showLoadingOverlay();

    const { chars } = await getPopularCharacters();

    hideLoadingOverlay();

    console.log("Char list:", chars);
    
    for (const char of chars)
        displayCharacter(char);
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

async function handleCharShare(charData) {
    if (!charData)
        return;

    const { id: charId } = charData;
    if (typeof charId != "string")
        return;

    const shareURL = `${location.protocol}//${location.hostname}/characters/${charId}/view`;
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

let chats = undefined;
async function handleChatOpen(charData) {
    console.log("Char:", charData);
    const { id } = charData;
    window.location = "/characters?add-character=" + id;
}

function displayCharacter(charData) {
    /*
        
        <span class="chat-bot-name">%%char_name%</span>
        <span class="chat-message-count" style="font-weight: 800;">
            <i class="fa-solid fa-at"></i>%%char_authorName%
        </span>
        <span class="chat-message-count">
            <i class="fa-solid fa-robot"></i>%%char_backend%
        </span>
        <span class="chat-message-count">
            <i class="fa-solid fa-quote-left"></i>%%char_blurb%<i class="fa-solid fa-quote-right"></i>
        </span>
        <span id="add-btn" class="chat-link-button">
            <span class="chat-choose-button">Add to chat<i class="fa-regular fa-message fa-btn"></i></span>
        </span>
    */
    const { totalMessageCount, displayName, avatarURL, id, authorId } = charData;
    const messageCount = window.formatNumberToHumanReadable(totalMessageCount, 1);
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

    let openButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faOpenIconNode = createNode("i", {}, [ "fa-regular", "fa-comments", "fa-btn" ]);
    openButtonNode.appendChild(faOpenIconNode);
    openButtonNode.addEventListener("click", () => handleChatOpen(charData));

    linkButtonContainer.appendChild(openButtonNode);

    if (authorId == myId) {
        let editButtonNode = createNode("a", { href: `/characters/${id}/edit` }, [ "link-clear" ]);
        let faEditIconNode = createNode("i", {}, [ "fa-regular", "fa-pen-to-square", "fa-btn" ]);
        editButtonNode.appendChild(faEditIconNode);

        linkButtonContainer.appendChild(editButtonNode);

        let deleteButtonNode = createNode("a", { }, [ "link-clear" ]);
        let faDeleteIconNode = createNode("i", {}, [ "fa-regular", "fa-trash-can", "fa-btn" ]);
        deleteButtonNode.appendChild(faDeleteIconNode);
        deleteButtonNode.addEventListener("click", () => handleCharDelete(charData));

        linkButtonContainer.appendChild(deleteButtonNode);
    }

    let shareButtonNode = createNode("a", { }, [ "link-clear" ]);
    let faShareIconNode = createNode("i", {}, [ "fa-regular", "fa-share-from-square", "fa-btn" ]);
    shareButtonNode.appendChild(faShareIconNode);
    shareButtonNode.addEventListener("click", () => handleCharShare(charData));

    linkButtonContainer.appendChild(shareButtonNode);

    contentContainer.appendChild(linkButtonContainer);
    container.appendChild(contentContainer);
    charList.prepend(container);
}