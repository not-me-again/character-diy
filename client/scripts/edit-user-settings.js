const MAX_FILE_SIZE = 6_000_000; // 6mb

// real shtuff
async function updateUserInfo(formData) {
    const req = await fetch("/api/updateUser", {
        headers: {
            authorization: localStorage.getItem("api-key")
        },
        method: "POST",
        body: formData
    });
    return await req.json();
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

const displayNameInput = document.querySelector("#display-name");
const birthdayInput = document.querySelector("#birthdate");
const customContextInput = document.querySelector("#user-desc");

const saveButton = document.querySelector("#save-btn");

const FORM_ELEM_LIST = [
    displayNameInput,
    birthdayInput,
    customContextInput
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


function formatBirthday(birthdateDate) {
    const day = birthdateDate.getDate() + 1;
    const month = birthdateDate.getMonth() + 1;
    return `${birthdateDate.getUTCFullYear()}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

async function doSetup(isNew) {
    setAllDisabled(true);

    let { profilePictureURL, displayName, birthdate, customChatContext } = await waitForCachedState();

    const birthdateDate = typeof birthdate == "number" ? new Date(birthdate) : new Date();
    const formattedBirthdate = formatBirthday(birthdateDate);

    setAllDisabled(false);

    pfpImg.src = profilePictureURL;
    displayNameInput.value = displayName;
    customContextInput.value = customChatContext;
    birthdayInput.defaultValue = formattedBirthdate;
    console.log(formattedBirthdate);

    saveButton.addEventListener("click", async e => {
        const missingInputs = doRequiredCheck();
        if (missingInputs && (missingInputs.length >= 1)) {
            let errorMsg = "Please correct the following errors:";
            for (let [ input, message ] of missingInputs) {
                errorMsg += `\n${input.name}: ` + message.toString();
                input.style.border = "1px solid red";
            }
            missingInputs[0][0].scrollIntoView();
            return alert(errorMsg);
        }
        if (isNew && (submitPfpButton.files.length <= 0))
            return alert("Missing profile picture");

        setAllDisabled(true);

        const data = {
            displayName: displayNameInput.value,
            birthdate: (new Date(birthdayInput.value)).getTime(),
            customChatContext: customContextInput.value
        };

        const form = new FormData();
        form.append("settings", JSON.stringify(data));
        const { files } = submitPfpButton;
        if (pfpUpdated && files.length >= 1) {
            const [ file ] = files;
            if (file.size < MAX_FILE_SIZE)
                form.append("avatar", file);
            else {
                submitPfpButton.value = "";
                return alert("File must be smaller than 6mb");
            }
        }

        const { success, error } = await updateUserInfo(form, isNew);
        if (!success) {
            console.error(error, character);
            alert(error);
        }

        setAllDisabled(false);

        await updateCachedState(true);
        location.reload();
    });
}

doSetup();