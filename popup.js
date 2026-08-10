const autoSkip = document.getElementById("autoSkip");
const adKiller = document.getElementById("adKiller");
const statusText = document.getElementById("statusText");

function setMode(mode) {
    chrome.storage.local.set({ mode });

    autoSkip.classList.toggle("active", mode === "auto_skip");
    adKiller.classList.toggle("active", mode === "ad_killer");

    statusText.textContent =
        mode === "auto_skip"
            ? "Auto Skip active"
            : "Ad Killer selected";
}

chrome.storage.local.get("mode", result => {
    setMode(result.mode || "auto_skip");
});

autoSkip.addEventListener("click", () => {
    setMode("auto_skip");
});

adKiller.addEventListener("click", () => {
    setMode("ad_killer");
});
