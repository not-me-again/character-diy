// real shtuff
async function getAllChats() {
    const req = await window.makeAuthenticatedRequest(`/api/chats`);
    return await req.json();
}

async function doChatsSetup() {
    showLoadingOverlay();
    
    const { chats } = await getAllChats();
    console.log("Chat list:", chats);
    for (const chat of chats)
        displayChat(chat);

    hideLoadingOverlay();
}
doChatsSetup();

const chatList = document.querySelector("#chat-list");
function displayChat(data) {
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
    const { messageCount, name, thumbnailURL, id } = data;
    if ((typeof messageCount != "number") || (typeof name != "string") || (typeof thumbnailURL != "string") || (typeof id != "string")) {
        console.error(data);
        return;
    }
    const href = `/chats/${id}`;
    const messageCountDisplay = window.formatNumberToHumanReadable(messageCount, 1);
    let container = createNode("tr", {}, [ "chat-list-item" ]);
    let pfpContainer = createNode("td", {}, [ "chat-bot-image" ]);
    let avatarNode = createNode("img", { src: thumbnailURL, alt: "pfp" }, [ "chat-bot-image" ]);
    pfpContainer.appendChild(avatarNode);
    container.appendChild(pfpContainer);
    let contentContainer = createNode("td", {}, [ "chat-bot-extra" ]);
    let usernameNode = createNode("span", { innerText: name }, [ "chat-bot-name" ]);
    contentContainer.appendChild(usernameNode);
    let messageCountNode = createNode("span", { innerText: messageCountDisplay }, [ "chat-message-count" ]);
    let faMessageIconNode = createNode("i", {}, [ "fa-regular", "fa-message" ]);
    messageCountNode.appendChild(faMessageIconNode);
    contentContainer.appendChild(messageCountNode);
    let chooseButtonContainer = createNode("span", {}, [ "chat-link-button" ]);
    let chooseButton = createNode("span", { innerText: "Open" }, [ "chat-choose-button" ]);
    let faChooseIconNode = createNode("i", {}, [ "fa-regular", "fa-circle-play", "fa-btn" ]);
    chooseButton.addEventListener("click", () => {
        window.location = href;
    });
    chooseButton.appendChild(faChooseIconNode);
    chooseButtonContainer.appendChild(chooseButton);
    contentContainer.appendChild(chooseButtonContainer);
    container.appendChild(contentContainer);
    chatList.prepend(container);
}