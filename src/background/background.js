const DEFAULT_SETTINGS = {
    enableSearchTitle: true,
    searchTitleFormat: "query_only",
    enableWeekday: true,
    includeTodayWeekday: true,
    enableCopyButton: true,
    includeHeaderInCopy: false
};

chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.sync.get(null);
    const toSet = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (existing[key] === undefined) {
            toSet[key] = value;
        }
    }
    // 旧設定の query_prefix を query_only に移行
    if (existing.searchTitleFormat === "query_prefix") {
        toSet.searchTitleFormat = "query_only";
    }
    if (Object.keys(toSet).length > 0) {
        await chrome.storage.sync.set(toSet);
    }
});
