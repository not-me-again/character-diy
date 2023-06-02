const MAX_FILE_SIZE = 6_000_000; // 6mb

// real shtuff
let isOwner = false;
let characterId = undefined;
if (!location.pathname.includes("/new"))
    characterId = location.pathname.match(/(?<=\/characters\/)[a-zA-Z0-9_-]+(?=\/edit[\/]?)/)?.toString();

console.log(characterId);

const { query } = location;
let charaImportId = query["import-chara"];
console.log("chara import id:", charaImportId);

if (location?.search?.startsWith("?switch-model"))
    document.querySelector("#switch-model").scrollIntoView();

async function getCharacterInfo() {
    return await window.makeAuthenticatedRequest(`/api/characters/${characterId}/info`, {}, true);
}
async function getCharaInfo(charaId) {
    return await window.makeAuthenticatedRequest(`/api/integrations/getTavernCharacterInfo/${charaId}`, {}, true);
}
async function getAvailableModels() {
    return await window.makeAuthenticatedRequest(`/api/characters/available-models.json`, {}, true);
}

async function updateCharacterInfo(formData, isNew) {
    try {
        const req = await fetch(!isNew ? `/api/characters/${characterId}/edit` : "/api/newCharacter", {
            headers: {
                authorization: localStorage.getItem("api-key")
            },
            method: "POST",
            body: formData
        });
        return await req.json();
    } catch(err) {
        return { success: false, error: err.toString() };
    }
}

let pfpUpdated = false;

const pfpImg = document.querySelector("#char-pfp");
const submitPfpButton = document.querySelector("#submit-pfp");
submitPfpButton.onchange = () => {
    const { files } = submitPfpButton;
    if (files && files.length >= 1) {
        const [ file ] = files;
        if (file.size < MAX_FILE_SIZE) {
            pfpImg.src =  URL.createObjectURL(files[0]);
            pfpUpdated = true;
        } else {
            submitPfpButton.value = "";
            return alert("File must be smaller than 6mb");
        }
    }
}

const charNameLabel = document.querySelector("#char-name");
const displayNameInput = document.querySelector("#display-name");
const pronounsInput = document.querySelector("#pronouns");
const startMessageInput = document.querySelector("#start-msg");
const backendInput = document.querySelector("#backend");

const shortDescriptionInput = document.querySelector("#short-desc");
const longDescriptionInput = document.querySelector("#long-desc");
const exampleConvoInput = document.querySelector("#example-convo");

const isPublicInput = document.querySelector("#is-public");
const isImageGeneratingInput = document.querySelector("#is-image-generating");

const saveButton = document.querySelector("#save-btn");

const PRONOUN_CONVERSION = {
    "he": 0,
    "she": 1,
    "they": 3,
    "it": 4
}

const IS_PUBLIC_CONVERSION = {
    false: 0,
    true: 1
}
const IS_IMAGE_GENERATING_CONVERSION = {
    false: 0,
    true: 1
}

const FORM_ELEM_LIST = [
    backendInput,
    startMessageInput,
    displayNameInput,
    pronounsInput,
    shortDescriptionInput,
    longDescriptionInput,
    exampleConvoInput,
    isPublicInput,
    isImageGeneratingInput
];

function setAllDisabled(isDisabled) {
    for (const elem of FORM_ELEM_LIST)
        elem.disabled = isDisabled;
}
setAllDisabled(true);

function doRequiredCheck() {
    let elems = [];
    for (const elem of FORM_ELEM_LIST)
        if (elem.required) {
            if (!elem.value)
                elems.push([ elem, "Required value" ]);
            else if ((typeof elem.minLength == "number") && (elem.minLength >= 0) && (elem.value.length < elem.minLength))
                elems.push([ elem, `Value too short (minimum ${elem.minLength.toString()})` ]);
            else if ((typeof elem.maxLength == "number") && (elem.maxLength >= 1) && (elem.value.length > elem.maxLength))
                elems.push([ elem, `Value too long (maximum ${elem.maxLength.toString()})` ]);
        }

    return (elems.length >= 1) ? elems : false;
}


for (const elem of FORM_ELEM_LIST)
    if (elem.required)
        elem.addEventListener("change", () => {
            if (!!elem.value)
                elem.style.border = "";
        });

const DEFAULT_CHARACTER_INFO = {
    characterData: {
        displayName: "",
        blurb: "",
        personalityPrompt: "",
        exampleConvo: "",
        pronouns: "they/them/their",
        isPublic: false,
        avatarURL: "/image/7206a04d03404e04e06e.png",
        startMessage: "",
        backend: "gpt-3.5-turbo"
    }
}

const errModal = document.querySelector("#err-msg-modal");
const errText = document.querySelector("#err-msg-text");

let saveBtnDebounce = Date.now();

async function doSetup(isNew) {
    showLoadingOverlay();
    await waitForCachedState();

    while (backendInput.firstChild)
        backendInput.firstChild.remove();
    const availableModels = await getAvailableModels();
    console.log("available models:", availableModels);
    for (const model of Object.values(availableModels)) {
        const { ID, ENABLED } = model;
        const modelChoice = createNode("option", {
            name: ID,
            disabled: !ENABLED,
            innerText: ID
        }, []);
        backendInput.appendChild(modelChoice);
    }

    let { characterData } = isNew
        ? (
            (typeof charaImportId == "string")
                ? await getCharaInfo(charaImportId)
                : DEFAULT_CHARACTER_INFO
        )
        : await getCharacterInfo();
    
    if (typeof characterData != "object")
        window.location = "/";

    console.log(characterData);

    isOwner = isNew || (cachedState?.id == characterData.authorId);
    setAllDisabled(!isOwner);

    charNameLabel.innerText = isNew ? "Create New Character" : characterData.displayName;
    pfpImg.src = characterData.avatarURL;
    displayNameInput.value = characterData.displayName;
    shortDescriptionInput.value = characterData.blurb;
    if (characterData.backend)
        backendInput.value = characterData.backend;
    startMessageInput.value = characterData.startMessage;
    longDescriptionInput.value = characterData.personalityPrompt;
    exampleConvoInput.value = characterData.exampleConvo;
    pronounsInput.selectedIndex = PRONOUN_CONVERSION[characterData?.pronouns?.personal];
    isPublicInput.selectedIndex = IS_PUBLIC_CONVERSION[characterData.isPublic];
    isImageGeneratingInput.selectedIndex = IS_IMAGE_GENERATING_CONVERSION[characterData.isImageGenerating];

    pfpUpdated = false;

    if (isOwner)
        saveButton.addEventListener("click", async e => {
            if ((Date.now() - saveBtnDebounce) < 1e3)
                return;
            saveBtnDebounce = Date.now();

            const missingInputs = doRequiredCheck();
            if (missingInputs && (missingInputs.length >= 1)) {
                let errorMsg = "Please correct the following errors:";
                for (let [ input, message ] of missingInputs) {
                    errorMsg += `\n${input.name}: ` + message.toString();
                    input.style.border = "1px solid red";
                }

                errText.innerText = errorMsg;
                errModal.style.display = "";
                errModal.scrollIntoView();

                return;
            }
            if (!charaImportId && isNew && (submitPfpButton.files.length <= 0)) {
                return alert("Missing profile picture");
            }

            setAllDisabled(true);

            const data = {
                displayName: displayNameInput.value,
                blurb: shortDescriptionInput.value,
                personalityPrompt: longDescriptionInput.value,
                startMessage: startMessageInput.value,
                exampleConvo: exampleConvoInput.value,
                pronouns: pronounsInput.selectedOptions[0].value,
                isPublic: isPublicInput.selectedIndex == 1,
                backend: backendInput.selectedOptions[0].value,
                isImageGenerating: isImageGeneratingInput.selectedIndex == 1,
                charaAvatar: charaImportId ? `${charaImportId}.webp` : undefined
            };

            const form = new FormData();
            form.append("settings", JSON.stringify(data));
            const { files } = submitPfpButton;
            if (pfpUpdated && (files.length >= 1)) {
                const [ file ] = files;
                if (file.size < MAX_FILE_SIZE)
                    form.append("avatar", file);
                else {
                    submitPfpButton.value = "";
                    return alert("File must be smaller than 6mb");
                }
            }

            showLoadingOverlay();
            
            const { success, error, character } = await updateCharacterInfo(form, isNew);

            hideLoadingOverlay();

            if (!character || !success) {
                console.error(error, character);
                alert(error);
            }

            setAllDisabled(false);

            window.location = "/characters?showUpdateSuccessModal=true";
        });
    else
        saveButton.remove();

    hideLoadingOverlay();
}

doSetup(location.pathname.includes("/new"));

/*window.onbeforeunload = function (e) {
    e = e || window.event;

    if (e) {
        e.returnValue = 'Are you sure?';
    }
    
    return 'Are you sure?';
};*/