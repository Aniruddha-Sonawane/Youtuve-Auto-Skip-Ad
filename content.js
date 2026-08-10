(() => {
    "use strict";

    let lastDetection = 0;

    function findSkip() {
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
                style.visibility !== "hidden"
            ) {
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            }
        }

        return null;
    }

    setInterval(() => {
        const now = Date.now();

        if (now - lastDetection < 1000) return;

        const point = findSkip();

        if (!point) return;

        lastDetection = now;

        console.log("[YouTube Auto Skip] Skip detected:", point);

        chrome.runtime.sendMessage({
            type: "CLICK_SKIP",
            x: point.x,
            y: point.y
        });
    }, 100);
})();
