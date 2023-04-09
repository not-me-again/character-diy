const MAX_FILE_SIZE = 6_000_000; // 6mb

// real shtuff
let isOwner = false;
let characterId = location.pathname.match(/(?<=\/characters\/)[a-zA-Z0-9_-]+(?=\/view[\/]?)/)?.toString();

console.log(characterId);

const addCharButton = document.querySelector("#add-btn");
addCharButton.addEventListener("click", () => {
    window.location = "/?add-character=" + characterId;
});

if (window.showIsPubWarn)
    document.querySelector("#not-public-warn").style.display = "";