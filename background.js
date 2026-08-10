const activeTabs = new Set();

chrome.runtime.onMessage.addListener((message, sender) => {
    if (
        message?.type !== "CLICK_SKIP" ||
        !sender.tab?.id ||
        typeof message.x !== "number" ||
        typeof message.y !== "number"
    ) {
        return;
    }

    clickAt(sender.tab.id, message.x, message.y);
});

async function clickAt(tabId, x, y) {
    if (activeTabs.has(tabId)) return;

    activeTabs.add(tabId);

    const target = { tabId };

    try {
        await chrome.debugger.attach(target, "1.3");

        await chrome.debugger.sendCommand(
            target,
            "Input.dispatchMouseEvent",
            {
                type: "mouseMoved",
                x,
                y
            }
        );

        await chrome.debugger.sendCommand(
            target,
            "Input.dispatchMouseEvent",
            {
                type: "mousePressed",
                x,
                y,
                button: "left",
                buttons: 1,
                clickCount: 1
            }
        );

        await chrome.debugger.sendCommand(
            target,
            "Input.dispatchMouseEvent",
            {
                type: "mouseReleased",
                x,
                y,
                button: "left",
                buttons: 0,
                clickCount: 1
            }
        );

        console.log("[YouTube Auto Skip] Physical click sent.");

    } catch (error) {
        console.error("[YouTube Auto Skip]", error);

    } finally {
        try {
            await chrome.debugger.detach(target);
        } catch {}

        activeTabs.delete(tabId);
    }
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
    activeTabs.delete(tabId);
});
