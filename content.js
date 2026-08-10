(() => {
    "use strict";

    let mode = "auto_skip";
    let lastSkipButton = null;
    let clickCooldown = 0;
    let lastAdSeek = 0;
    let adWasDetected = false;

    chrome.storage.local.get("mode", result => {
        mode = result.mode || "auto_skip";
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.mode) {
            mode = changes.mode.newValue || "auto_skip";

            lastSkipButton = null;
            clickCooldown = 0;
            lastAdSeek = 0;
            adWasDetected = false;

            console.log("[YouTube Auto Skip] Mode:", mode);
        }
    });

    /*
     * ---------------------------------------------------------
     * REAL YOUTUBE AD STATE
     * ---------------------------------------------------------
     */

    function isAdActuallyPlaying() {
        const player = document.querySelector("#movie_player");

        if (!player) return false;

        return (
            player.classList.contains("ad-showing") ||
            player.classList.contains("ad-interrupting")
        );
    }

    /*
     * ---------------------------------------------------------
     * SKIP BUTTON
     * ---------------------------------------------------------
     */

    function getSkipButton() {
        const selectors = [
            "button.ytp-skip-ad-button",
            ".ytp-skip-ad-button",
            ".ytp-ad-skip-button",
            ".ytp-ad-skip-button-modern"
        ];

        for (const selector of selectors) {
            for (const button of document.querySelectorAll(selector)) {

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
                        element: button,
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                    };
                }
            }
        }

        return null;
    }

    function physicalClick(point) {
        chrome.runtime.sendMessage({
            type: "CLICK_SKIP",
            x: point.x,
            y: point.y
        });
    }

    /*
     * ---------------------------------------------------------
     * MODE 1 — AUTO SKIP
     * ---------------------------------------------------------
     */

    function runAutoSkip() {
        const skip = getSkipButton();

        if (!skip) {
            lastSkipButton = null;
            return;
        }

        const now = Date.now();

        if (now < clickCooldown) return;
        if (skip.element === lastSkipButton) return;

        lastSkipButton = skip.element;
        clickCooldown = now + 5000;

        console.log("[Auto Skip] Skip detected.");

        physicalClick(skip);
    }

    /*
     * ---------------------------------------------------------
     * MODE 2 — AD KILLER
     * ---------------------------------------------------------
     *
     * Only operate when #movie_player itself says:
     *
     *     ad-showing
     *
     * We NEVER seek the video during normal playback.
     */

    function runAdKiller() {

        if (mode !== "ad_killer") return;

        const adPlaying = isAdActuallyPlaying();

        if (!adPlaying) {
            if (adWasDetected) {
                console.log("[Ad Killer] Ad ended.");
            }

            adWasDetected = false;
            lastAdSeek = 0;
            return;
        }

        if (!adWasDetected) {
            adWasDetected = true;

            console.log("[Ad Killer] Ad detected.");
        }

        /*
         * First use the proven physical Skip click if
         * YouTube has already made Skip available.
         */

        const skip = getSkipButton();

        if (skip) {
            const now = Date.now();

            if (
                now >= clickCooldown &&
                skip.element !== lastSkipButton
            ) {
                lastSkipButton = skip.element;
                clickCooldown = now + 5000;

                console.log("[Ad Killer] Skip available.");

                physicalClick(skip);

                return;
            }
        }

        /*
         * No Skip button yet.
         *
         * Find the player video ONLY while the player is
         * explicitly in ad-showing state.
         */

        const now = Date.now();

        if (now - lastAdSeek < 20) return;

        const player = document.querySelector("#movie_player");

        if (!player) return;

        const video = player.querySelector("video");

        if (!video) return;

        if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0
        ) {
            return;
        }

        if (video.readyState < 2) return;

        /*
         * Seek the AD playback position to its END.
         *
         * This is deliberately only executed while
         * YouTube reports that the player is showing an ad.
         */

        lastAdSeek = now;

        try {
            video.currentTime = Math.max(
                0,
                video.duration - 0.05
            );

            console.log(
                "[Ad Killer] Seeking ad to end:",
                video.duration
            );

        } catch (error) {
            console.warn(
                "[Ad Killer] Could not seek ad:",
                error
            );
        }
    }

    /*
     * 10ms polling = very fast detection.
     */

    setInterval(() => {

        if (mode === "auto_skip") {
            runAutoSkip();
        }

        if (mode === "ad_killer") {
            runAdKiller();
        }

    }, 10);

})();
