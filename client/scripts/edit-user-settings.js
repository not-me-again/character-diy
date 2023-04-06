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

const saveButton = document.querySelector("#save-btn");

const FORM_ELEM_LIST = [
    displayNameInput,
    birthdayInput
];

function setAllDisabled(isDisabled) {
    for (const elem of FORM_ELEM_LIST)
        elem.disabled = isDisabled;
}
setAllDisabled(true);

function doRequiredCheck() {
    let elems = [];
    for (const elem of FORM_ELEM_LIST)
        if (elem.required && !elem.value)
            elems.push(elem);

    return (elems.length >= 1) ? elems : false;
}


for (const elem of FORM_ELEM_LIST)
    if (elem.required)
        elem.addEventListener("change", () => {
            if (!!elem.value)
                elem.style.border = "";
        });

async function doSetup(isNew) {
    setAllDisabled(true);

    let { profilePictureURL, displayName, birthdate } = await waitForCachedState();

    const birthdateDate = typeof birthdate == "number" ? new Date(birthdate) : new Date();
    const formattedBirthdate = `${birthdateDate.getUTCFullYear()}-${birthdateDate.getUTCMonth().toString().padStart(2, "0")}-${birthdateDate.getUTCDate().toString().padStart(2, "0")}`;

    setAllDisabled(false);

    pfpImg.src = profilePictureURL;
    displayNameInput.value = displayName;
    birthdayInput.defaultValue = formattedBirthdate;
    console.log(formattedBirthdate);

    saveButton.addEventListener("click", async e => {
        const missingInputs = doRequiredCheck();
        if (missingInputs && (missingInputs.length >= 1)) {
            for (let input of missingInputs)
                input.style.border = "1px solid red";
            missingInputs[0].scrollIntoView();
            return alert("Missing required field: " + missingInputs[0].name);
        }
        if (isNew && (submitPfpButton.files.length <= 0))
            return alert("Missing profile picture");

        setAllDisabled(true);

        const data = {
            displayName: displayNameInput.value,
            birthdate: (new Date(birthdayInput.value)).getTime()
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