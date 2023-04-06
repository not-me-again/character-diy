window.cachedState = undefined;
const sleep = ms => { return new Promise(res => setTimeout(res, ms)) };
async function waitForCachedState() {
    for (;;)
        if (cachedState)
            break;
        else
            await sleep(100);

    return cachedState;
}
window.waitForCachedState = waitForCachedState;
// serialize query params
const searchCSV = location.search.replace(/[?&]/gmi, "").split("=");
location.query = {};
for (let i = 0; i < searchCSV.length; i += 2)
    location.query[searchCSV[i]] = searchCSV[i + 1];
// end serialize query params
if (location.query.apiKey) {
    localStorage.setItem("api-key", location.query.apiKey);
    history.pushState({}, "", location.origin + location.pathname);
}
// page setup
const toggleButton = document.querySelector(".dark-light");
const colors = document.querySelectorAll(".color");

colors.forEach(color => {
    color.addEventListener("click", (e) => {
        colors.forEach(c => c.classList.remove("selected"));
        const theme = color.getAttribute("data-color");
        document.body.setAttribute("data-theme", theme);
        color.classList.add("selected");
    });
});

toggleButton.addEventListener("click", () => {
    if (localStorage.getItem("dark-mode") == "true") {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("dark-mode", false);
    } else {
        document.body.classList.add("dark-mode");
        localStorage.setItem("dark-mode", true);
    }
});

if (localStorage.getItem("dark-mode") == "true")
    document.body.classList.add("dark-mode");

/* helpers */
function createNode(type, properties, classes) {
    let node = document.createElement(type);
    for (const [prop, value] of Object.entries(properties)) {
        node[prop] = value;
    }
    for (let c of classes) {
        node.classList.add(c);
    }
    return node;
}
window.createNode = createNode;

function randInt(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}
window.randInt = randInt;

function formatNumberToHumanReadable(num, digits) {
    const lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "G" },
        { value: 1e12, symbol: "T" },
        { value: 1e15, symbol: "P" },
        { value: 1e18, symbol: "E" }
    ];
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
}
window.formatNumberToHumanReadable = formatNumberToHumanReadable;

//
const CLICHE_LOADING_MESSAGES = [
    [ "You know what they say about people with patience? I'll tell you in a bit.", 0 ],
    [ "Did you know? Albert Einstein invented AI in 2004, the acronym even stands for his name!", 2 ],
    [ "Insane in the neural network", 1 ],
    [ "Why did the AI take scuba lessons? It wanted to try deep learning.", 0 ],
    [ "This is the algorithm of the night", 1 ],
    [ "Why did the AI go on a diet? It wanted to optimize its byte size.", 0 ],
    [ "All the singularities, all the singularities", 1 ],
    [ "How many AI programmers does it take to change a light bulb? None, that's a hardware problem.", 0 ],
    [ "Bard? More like jester.", 0 ],
    [ "Why did the AI flunk out? It failed the Turing test.", 0 ],
    [ "An AI walks into a bar and orders a martini. The bartender asks, \"Will that be on the silicon?\"", 0 ],
    [ "My 175 billion parameter transformative language model brings all the boys to the yard", 1 ],
    [ "Introducing GPT: Generative Pirate Transformer, the latest in arrrrrrtificial Intelligence.", 0 ]
];
const loadingOverlay = document.querySelector("#loading-overlay");
const clicheLoadingMessage = document.querySelector("#cliche-loading-message");
function showLoadingOverlay() {
    const clicheMsg = CLICHE_LOADING_MESSAGES[randInt(0, CLICHE_LOADING_MESSAGES.length - 1)];
    const [iBefore, iAfter] = [clicheLoadingMessage.previousSibling, clicheLoadingMessage.nextSibling];
    switch (clicheMsg[1]) {
        case 1:
            iBefore.classList = "fa-solid fa-music";
            iAfter.classList = "fa-solid fa-music";
            break;
        case 2:
            iBefore.classList = "fa-regular fa-circle-question";
            iAfter.classList = "hidden";
            break;
        case 0:
        default:
            iBefore.classList = "fa-solid fa-quote-left";
            iAfter.classList = "fa-solid fa-quote-right";
            break;
    }
    clicheLoadingMessage.innerText = clicheMsg[0];
    loadingOverlay.style.display = "";
}
window.showLoadingOverlay = window.showLoadingOverlay;
function hideLoadingOverlay() {
    loadingOverlay.style.display = "none";
}
window.hideLoadingOverlay = window.hideLoadingOverlay;
hideLoadingOverlay();

// api stuff
const apiKey = localStorage.getItem("api-key");
if (typeof apiKey != "string")
    window.location = "/login";

async function makeAuthenticatedRequest(url, opts, parseJson) {
    if (typeof opts != "object")
        opts = {};
    if (typeof opts.headers != "object")
        opts.headers = {};
    
    opts.headers["Content-Type"] = "application/json";
    opts.headers.authorization = apiKey;

    try {
        const req = await fetch(url, opts);
        if (parseJson)
            return await req.json();
        else
            return req;
    } catch(err) {
        console.error(err);
        return {};
    }
}
window.makeAuthenticatedRequest = makeAuthenticatedRequest;

async function updateCachedState(force) {
    const oldState = localStorage.getItem("cached-state");
    if (oldState && (typeof oldState == "string")) {
        let parsedOldState = JSON.parse(oldState);
        if (!force && (typeof parsedOldState.updatedAt == "number") && ((Date.now() - parsedOldState.updatedAt) < 3600000)) {
            window.cachedState = parsedOldState;
            return;
        }
    }
    console.log("Updating cached data...");
    window.cachedState = undefined;
    try {
        const session = await makeAuthenticatedRequest("/api/session");
        const data = await session.json();
        const userData = data?.user;
        if (!data || !userData)
            throw new Error("Failed to update cache");
        const newCachedState = {
            updatedAt: Date.now(),
            ...userData
        }
        window.cachedState = newCachedState;
        localStorage.setItem("cached-state", JSON.stringify(newCachedState));
    } catch (err) {
        console.error(err);
        window.location = "/login";
    }
    console.log("Cached state saved");
}
updateCachedState();

waitForCachedState().then(state => {
    const profilePic = document.querySelector("#pfp");
    profilePic.addEventListener("click", () => {
        window.location = "/user";
    })
    profilePic.src = state.profilePictureURL;
});