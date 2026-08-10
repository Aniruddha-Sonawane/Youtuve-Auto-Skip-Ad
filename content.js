(() => {
    "use strict";

    let mode = "auto_skip";

    let lastSkipButton = null;
    let clickCooldown = 0;

    let adWasDetected = false;
    let adCounted = false;
    let lastAdSeek = 0;

    let observer = null;
    let scheduled = false;

    let videoElement = null;
    let videoListenerAttached = false;

    const scheduledBreaks = new Map();

    chrome.storage.local.get("mode", result => {
        mode = result.mode || "auto_skip";
        start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.mode) return;

        mode = changes.mode.newValue || "auto_skip";

        clearScheduledBreaks();

        lastSkipButton = null;
        clickCooldown = 0;
        adWasDetected = false;
        adCounted = false;
        lastAdSeek = 0;

        scheduleCheck();
    });

    function getPlayer() {
        return document.querySelector("#movie_player");
    }

    function isAdShowing() {
        const player = getPlayer();

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
     * ADS KILLED COUNTER
     * ---------------------------------------------------------
     */

    function countAdKilled() {

        if (adCounted) return;

        adCounted = true;

        chrome.storage.local.get(
            { adsKilled: 0 },
            result => {

                const newCount =
                    Number(result.adsKilled || 0) + 1;

                chrome.storage.local.set({
                    adsKilled: newCount
                });

                console.log(
                    "[YouTube Ad Control] Ads killed:",
                    newCount
                );
            }
        );
    }

    /*
     * ---------------------------------------------------------
     * AUTO SKIP
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

        physicalClick(skip);

        /*
         * Count this ad when Auto Skip actually sends
         * the successful Skip action.
         */
        countAdKilled();
    }

    /*
     * ---------------------------------------------------------
     * AD KILLER
     * ---------------------------------------------------------
     */

    function runAdKiller() {

        if (!isAdShowing()) {

            if (adWasDetected) {
                adWasDetected = false;
                adCounted = false;
            }

            lastAdSeek = 0;

            return;
        }

        if (!adWasDetected) {
            adWasDetected = true;
            adCounted = false;

            console.log("[Ad Killer] Ad detected.");
        }

        const skip = getSkipButton();

        if (skip) {

            const now = Date.now();

            if (
                now >= clickCooldown &&
                skip.element !== lastSkipButton
            ) {
                lastSkipButton = skip.element;
                clickCooldown = now + 5000;

                physicalClick(skip);
                countAdKilled();

                return;
            }
        }

        const now = Date.now();

        if (now - lastAdSeek < 50) return;

        const player = getPlayer();
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

            countAdKilled();

        } catch {}
    }

    /*
     * ---------------------------------------------------------
     * ULTIMATE
     * ---------------------------------------------------------
     */

    function killCurrentAd() {

        if (!isAdShowing()) return false;

        const skip = getSkipButton();

        if (skip) {

            physicalClick(skip);
            countAdKilled();

            return true;
        }

        const player = getPlayer();
        if (!player) return false;

        const video = player.querySelector("video");
        if (!video) return false;

        if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0 ||
            video.readyState < 2
        ) {
            return false;
        }

        try {

            video.currentTime = Math.max(
                0,
                video.duration - 0.03
            );

            countAdKilled();

            return true;

        } catch {
            return false;
        }
    }

    /*
     * ---------------------------------------------------------
     * PLAYER RESPONSE / AD PLACEMENTS
     * ---------------------------------------------------------
     */

    function getPlayerResponse() {

        try {

            if (
                window.ytInitialPlayerResponse &&
                typeof window.ytInitialPlayerResponse === "object"
            ) {
                return window.ytInitialPlayerResponse;
            }

        } catch {}

        try {

            if (
                window.ytplayer &&
                window.ytplayer.config &&
                window.ytplayer.config.args &&
                window.ytplayer.config.args.player_response
            ) {

                const raw =
                    window.ytplayer.config.args.player_response;

                if (typeof raw === "string") {
                    return JSON.parse(raw);
                }

                return raw;
            }

        } catch {}

        return null;
    }

    function extractPlacementsFromObject(root) {

        const results = [];

        if (!root || typeof root !== "object") {
            return results;
        }

        function walk(obj, depth) {

            if (!obj || typeof obj !== "object") return;
            if (depth > 20) return;

            if (Array.isArray(obj)) {

                for (const item of obj) {
                    walk(item, depth + 1);
                }

                return;
            }

            if (
                typeof obj.offsetStartMilliseconds === "number" &&
                Number.isFinite(obj.offsetStartMilliseconds)
            ) {

                if (
                    obj.adPlacementRenderer ||
                    obj.adTimeOffset ||
                    obj.adBreakServiceRenderer
                ) {
                    results.push(
                        obj.offsetStartMilliseconds
                    );
                }
            }

            if (
                typeof obj.offsetStartMilliseconds === "string"
            ) {

                const n =
                    Number(obj.offsetStartMilliseconds);

                if (
                    Number.isFinite(n) &&
                    (
                        obj.adPlacementRenderer ||
                        obj.adTimeOffset ||
                        obj.adBreakServiceRenderer
                    )
                ) {
                    results.push(n);
                }
            }

            for (const key of Object.keys(obj)) {

                const value = obj[key];

                if (
                    value &&
                    typeof value === "object"
                ) {
                    walk(value, depth + 1);
                }
            }
        }

        walk(root, 0);

        return [...new Set(results)];
    }

    function extractPlacementsFromPage() {

        const found = [];

        const html =
            document.documentElement?.innerHTML || "";

        const regex =
            /"offsetStartMilliseconds"\s*:\s*"?(\d+)"?/g;

        let match;

        while ((match = regex.exec(html)) !== null) {

            const value = Number(match[1]);

            if (
                Number.isFinite(value) &&
                value >= 0 &&
                value < 86400000
            ) {
                found.push(value);
            }
        }

        return [...new Set(found)];
    }

    function clearScheduledBreaks() {

        for (const timer of scheduledBreaks.values()) {
            clearTimeout(timer);
        }

        scheduledBreaks.clear();
    }

    function schedulePlacement(offsetMs) {

        const video = getPlayer()?.querySelector("video");

        if (!video) return;

        if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0
        ) {
            return;
        }

        const currentMs =
            video.currentTime * 1000;

        if (offsetMs <= currentMs + 1000) {
            return;
        }

        if (scheduledBreaks.has(offsetMs)) {
            return;
        }

        const leadTime = 150;

        const delay = Math.max(
            0,
            offsetMs - currentMs - leadTime
        );

        const timer = setTimeout(() => {

            scheduledBreaks.delete(offsetMs);

            if (mode !== "ultimate") return;

            const currentVideo =
                getPlayer()?.querySelector("video");

            if (!currentVideo) return;

            const targetSeconds =
                (offsetMs / 1000) + 0.75;

            if (
                Number.isFinite(currentVideo.duration) &&
                targetSeconds < currentVideo.duration
            ) {

                try {

                    currentVideo.currentTime =
                        targetSeconds;

                    countAdKilled();

                    console.log(
                        "[Ultimate] Bypassed ad at",
                        (offsetMs / 1000).toFixed(2),
                        "seconds"
                    );

                } catch {}
            }

        }, delay);

        scheduledBreaks.set(offsetMs, timer);
    }

    function discoverAdPlacements() {

        if (mode !== "ultimate") return;

        const response = getPlayerResponse();

        let placements = [];

        if (response) {
            placements =
                extractPlacementsFromObject(response);
        }

        if (!placements.length) {
            placements =
                extractPlacementsFromPage();
        }

        placements = [
            ...new Set(
                placements
                    .filter(x => Number.isFinite(x))
                    .filter(x => x >= 0)
            )
        ];

        for (const placement of placements) {
            schedulePlacement(placement);
        }
    }

    function runUltimate() {

        discoverAdPlacements();

        if (isAdShowing()) {

            if (!adWasDetected) {
                adWasDetected = true;
                adCounted = false;
            }

            killCurrentAd();

        } else {

            if (adWasDetected) {
                adWasDetected = false;
                adCounted = false;
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * EVENT SYSTEM
     * ---------------------------------------------------------
     */

    function scheduleCheck() {

        if (scheduled) return;

        scheduled = true;

        queueMicrotask(() => {

            scheduled = false;

            if (mode === "auto_skip") {
                runAutoSkip();
            }

            else if (mode === "ad_killer") {
                runAdKiller();
            }

            else if (mode === "ultimate") {
                runUltimate();
            }
        });
    }

    function attachVideoEvents() {

        const video = getPlayer()?.querySelector("video");

        if (!video || video === videoElement) {
            return;
        }

        videoElement = video;

        video.addEventListener(
            "loadedmetadata",
            () => {
                if (mode === "ultimate") {
                    discoverAdPlacements();
                }

                scheduleCheck();
            }
        );

        video.addEventListener(
            "durationchange",
            () => {

                if (mode === "ultimate") {
                    discoverAdPlacements();
                }

            }
        );

        video.addEventListener(
            "play",
            scheduleCheck
        );
    }

    function startObserver() {

        const player = getPlayer();

        if (!player) {

            setTimeout(
                startObserver,
                500
            );

            return;
        }

        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(() => {

            attachVideoEvents();

            scheduleCheck();

            if (mode === "ultimate") {
                discoverAdPlacements();
            }
        });

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

        attachVideoEvents();
        scheduleCheck();

        if (mode === "ultimate") {
            discoverAdPlacements();
        }

        console.log(
            "[YouTube Ad Control] Ready."
        );
    }

    function start() {
        startObserver();
    }

})();
