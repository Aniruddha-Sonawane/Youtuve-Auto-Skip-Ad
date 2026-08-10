(() => {
    "use strict";

    let mode = "auto_skip";
    let lastSkipButton = null;
    let clickCooldown = 0;
    let lastAdSeek = 0;
    let adWasDetected = false;
    let scheduled = false;

    chrome.storage.local.get("mode", result => {
        mode = result.mode || "auto_skip";
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.mode) return;

        mode = changes.mode.newValue || "auto_skip";

        lastSkipButton = null;
        clickCooldown = 0;
        lastAdSeek = 0;
        adWasDetected = false;

        scheduleCheck();
    });

    function isAdShowing() {
        const player = document.querySelector("#movie_player");

        return !!(
            player &&
            (
                player.classList.contains("ad-showing") ||
                player.classList.contains("ad-interrupting")
            )
        );
    }

    function getSkipButton() {
        const selectors = [
            "button.ytp-skip-ad-button",
            ".ytp-skip-ad-button",
            ".ytp-ad-skip-button",
            ".ytp-ad-skip-button-modern"
        ];

        for (const selector of selectors) {
            const buttons = document.querySelectorAll(selector);

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

        console.log("[Auto Skip] Clicking Skip.");

        physicalClick(skip);
    }

    function runAdKiller() {
        if (!isAdShowing()) {
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
         * If Skip is already available, use the proven
         * physical mouse click.
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

                console.log("[Ad Killer] Clicking Skip.");

                physicalClick(skip);
                return;
            }
        }

        /*
         * No Skip button:
         * only touch the player while YouTube explicitly
         * reports that an ad is playing.
         */
        const now = Date.now();

        if (now - lastAdSeek < 50) return;

        const player = document.querySelector("#movie_player");
        if (!player) return;

        const video = player.querySelector("video");
        if (!video) return;

        if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0 ||
            video.readyState < 2
        ) {
            return;
        }

        lastAdSeek = now;

        try {
            video.currentTime = Math.max(
                0,
                video.duration - 0.05
            );

            console.log("[Ad Killer] Moved ad playback to end.");

        } catch {}
    }

    function run() {
        scheduled = false;

        if (mode === "auto_skip") {
            runAutoSkip();
        } else if (mode === "ad_killer") {
            runAdKiller();
        }
    }

    /*
     * Coalesce multiple DOM mutations into one check.
     * This prevents a burst of YouTube DOM changes from
     * causing hundreds of executions.
     */
    function scheduleCheck() {
        if (scheduled) return;

        scheduled = true;

        queueMicrotask(run);
    }

    /*
     * Watch YouTube's player/ad DOM.
     *
     * There is NO setInterval polling here.
     */
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {

            if (mutation.type === "attributes") {
                if (
                    mutation.attributeName === "class" ||
                    mutation.attributeName === "style" ||
                    mutation.attributeName === "disabled"
                ) {
                    scheduleCheck();
                    return;
                }
            }

            if (
                mutation.type === "childList" &&
                (
                    mutation.addedNodes.length ||
                    mutation.removedNodes.length
                )
            ) {
                scheduleCheck();
                return;
            }
        }
    });

    function startObserver() {
        const player = document.querySelector("#movie_player");

        if (!player) {
            setTimeout(startObserver, 500);
            return;
        }

        observer.observe(player, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: [
                "class",
                "style",
                "disabled"
            ]
        });

        console.log(
            "[YouTube Auto Skip] Event-driven mode active."
        );

        scheduleCheck();
    }

    startObserver();

})();
