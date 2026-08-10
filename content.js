(() => {
    "use strict";

    let cooldownUntil = 0;
    let lastButton = null;

    function findSkipButton() {
        const buttons = document.querySelectorAll(
            "button.ytp-skip-ad-button"
        );

        for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            const style = getComputedStyle(button);

            if (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.pointerEvents !== "none"
            ) {
                return {
                    button,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            }
        }

        return null;
    }

    function check() {
        const now = Date.now();

        if (now < cooldownUntil) return;

        const result = findSkipButton();

        if (!result) {
            lastButton = null;
            return;
        }

        // Don't repeatedly click the same Skip button.
        if (result.button === lastButton) return;

        lastButton = result.button;

        // Give YouTube a moment to finish activating the button.
        cooldownUntil = now + 5000;

        console.log("[YouTube Auto Skip] Skip detected.");

        chrome.runtime.sendMessage({
            type: "CLICK_SKIP",
            x: result.x,
            y: result.y
        });
    }

    setInterval(check, 100);
})();
