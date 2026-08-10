document.addEventListener("DOMContentLoaded", async () => {

    const buttons =
        document.querySelectorAll(".mode");

    const counter =
        document.getElementById("adsKilled");

    const reset =
        document.getElementById("resetCounter");

    async function updateCounter() {

        const result =
            await chrome.storage.local.get({
                adsKilled: 0
            });

        counter.textContent =
            Number(result.adsKilled || 0).toLocaleString();
    }

    const result =
        await chrome.storage.local.get({
            mode: "auto_skip"
        });

    for (const button of buttons) {

        if (
            button.dataset.mode ===
            result.mode
        ) {
            button.classList.add("active");
        }

        button.addEventListener(
            "click",
            async () => {

                await chrome.storage.local.set({
                    mode: button.dataset.mode
                });

                for (const other of buttons) {
                    other.classList.remove("active");
                }

                button.classList.add("active");
            }
        );
    }

    reset.addEventListener(
        "click",
        async () => {

            await chrome.storage.local.set({
                adsKilled: 0
            });

            updateCounter();
        }
    );

    await updateCounter();

    chrome.storage.onChanged.addListener(
        (changes, area) => {

            if (
                area === "local" &&
                changes.adsKilled
            ) {
                updateCounter();
            }
        }
    );
});
