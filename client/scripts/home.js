// real shtuff

async function getCharacterInfo(charId) {
    return await window.makeAuthenticatedRequest(`/api/characters/${charId}/info`, {}, true);
}
async function getPopularCharacters() {
    return await window.makeAuthenticatedRequest(`/api/popularCharacters`, {}, true);
}
async function getTavernCharacters(search) {
    let url = `/api/integrations/getTavernCharacters`;
    if (typeof search == "string")
        url += `/?search={encodeURIComponent(search)}`;
    return await window.makeAuthenticatedRequest(url, {}, true);
}
async function getAllChats() {
    return await window.makeAuthenticatedRequest(`/api/chats`, {}, true);
}
async function setOnboardingComplete(isComplete) {
    return await window.makeAuthenticatedRequest(`/api/setUserOnboardingCompleted`, {
        method: "POST",
        body: JSON.stringify({ isComplete })
    }, true);
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

const onboardingModal = document.querySelector("#onboarding-overlay");
function doShowOnboardingModal() {
    onboardingModal.style.display = "";
}

const onboardingCloseButton = document.querySelector("#onboarding-close");
function doHideOnboardingModal() {
    onboardingModal.style.display = "none";
    setOnboardingComplete(true);
}
onboardingCloseButton.addEventListener("click", doHideOnboardingModal);

let myId = (typeof cachedState == "object") ? cachedState.id : undefined;
waitForCachedState().then(state => {
    myId = state.id;
    if (!state.onboardingCompleted)
        doShowOnboardingModal();
});

const charList = document.querySelector("#char-list");

async function doCharactersSetup() {
    showLoadingOverlay();

    const { chars: popularChars } = await getPopularCharacters();
    const { chars: tavernChars } = await getTavernCharacters();

    hideLoadingOverlay();

    console.log("pop char list:", popularChars);
    console.log("tavern char list:", tavernChars);
    
    for (const char of popularChars)
        displayCharacter(char);
    
    for (const char of tavernChars)
        displayTavernCharacter(char);
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
//
const tavernAIList = document.querySelector("#tavern-list");
function displayTavernCharacter(charData) {
    const { tags, displayName, avatarURL, charaId, blurb } = charData;
    let container = createNode("tr", {}, [ "chat-list-item" ]);

    let pfpContainer = createNode("td", {}, [ "chat-bot-image" ]);
    let avatarNode = createNode("img", { src: avatarURL, alt: "pfp" }, [ "chat-bot-image" ]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);

    let contentContainer = createNode("td", {}, [ "chat-bot-extra" ]);
    let usernameNode = createNode("span", { innerText: displayName }, [ "chat-bot-name" ]);
    contentContainer.appendChild(usernameNode);

    let messageCountNode = createNode("span", {}, [ "chat-message-count" ]);
    let faMessageIconNode = createNode("i", {}, [ "fa-solid", "fa-hashtag" ]);
    messageCountNode.appendChild(faMessageIconNode);
    let tagsNode = createNode("span", { innerText: tags.join(", ") }, []);
    messageCountNode.appendChild(tagsNode);
    contentContainer.appendChild(messageCountNode);

    let blurbContainerNode = createNode("span", {}, [ "chat-message-count" ]);
    let faLeftQuoteNode = createNode("i", {}, [ "fa-solid", "fa-quote-left" ]);
    blurbContainerNode.appendChild(faLeftQuoteNode);
    let blurbTextNode = createNode("span", { innerText: blurb }, []);
    blurbContainerNode.appendChild(blurbTextNode);
    let faRightQuoteNode = createNode("i", {}, [ "fa-solid", "fa-quote-right" ]);
    blurbContainerNode.appendChild(faRightQuoteNode);
    contentContainer.appendChild(blurbContainerNode);

    let linkButtonContainer = createNode("span", {}, [ "chat-link-button" ]);

    let openButtonNode = createNode("a", { href: `/characters/new?import-chara=${charaId}` }, [ "link-clear" ]);
    let faOpenIconNode = createNode("i", {}, [ "fa-regular", "fa-comments", "fa-btn" ]);
    openButtonNode.appendChild(faOpenIconNode);

    linkButtonContainer.appendChild(openButtonNode);

    contentContainer.appendChild(linkButtonContainer);
    container.appendChild(contentContainer);
    tavernAIList.prepend(container);
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

    let blurbContainerNode = createNode("span", {}, [ "chat-message-count" ]);
    let faLeftQuoteNode = createNode("i", {}, [ "fa-solid", "fa-quote-left" ]);
    blurbContainerNode.appendChild(faLeftQuoteNode);
    let blurbTextNode = createNode("span", { innerText: blurb }, []);
    blurbContainerNode.appendChild(blurbTextNode);
    let faRightQuoteNode = createNode("i", {}, [ "fa-solid", "fa-quote-right" ]);
    blurbContainerNode.appendChild(faRightQuoteNode);
    contentContainer.appendChild(blurbContainerNode);

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