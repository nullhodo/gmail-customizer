document.addEventListener("DOMContentLoaded", async () => {
    const fields = {
        enableSearchTitle: document.getElementById("enableSearchTitle"),
        searchTitleFormat: document.getElementById("searchTitleFormat"),
        enableWeekday: document.getElementById("enableWeekday"),
        weekdayColorize: document.getElementById("weekdayColorize"),
        includeTodayWeekday: document.getElementById("includeTodayWeekday"),
        enableCopyButton: document.getElementById("enableCopyButton"),
        includeHeaderInCopy: document.getElementById("includeHeaderInCopy")
    };

    const searchTitleFormatArea = document.getElementById(
        "searchTitleFormatArea"
    );
    const weekdayOptionsArea = document.getElementById("weekdayOptionsArea");
    const copyButtonOptionsArea = document.getElementById(
        "copyButtonOptionsArea"
    );

    // 保存されている設定を読み込み
    const data = await chrome.storage.sync.get({
        enableSearchTitle: true,
        searchTitleFormat: "query_prefix",
        enableWeekday: true,
        weekdayColorize: true,
        includeTodayWeekday: true,
        enableCopyButton: true,
        includeHeaderInCopy: false
    });

    // UIに反映
    fields.enableSearchTitle.checked = data.enableSearchTitle;
    fields.searchTitleFormat.value = data.searchTitleFormat;
    fields.enableWeekday.checked = data.enableWeekday;
    fields.weekdayColorize.checked = data.weekdayColorize;
    fields.includeTodayWeekday.checked = data.includeTodayWeekday;
    fields.enableCopyButton.checked = data.enableCopyButton;
    fields.includeHeaderInCopy.checked = data.includeHeaderInCopy;

    function updateSubOptionsState() {
        searchTitleFormatArea.classList.toggle(
            "disabled",
            !fields.enableSearchTitle.checked
        );
        weekdayOptionsArea.classList.toggle(
            "disabled",
            !fields.enableWeekday.checked
        );
        copyButtonOptionsArea.classList.toggle(
            "disabled",
            !fields.enableCopyButton.checked
        );
    }

    updateSubOptionsState();

    // 変更時に保存
    async function saveSettings() {
        const newSettings = {
            enableSearchTitle: fields.enableSearchTitle.checked,
            searchTitleFormat: fields.searchTitleFormat.value,
            enableWeekday: fields.enableWeekday.checked,
            weekdayColorize: fields.weekdayColorize.checked,
            includeTodayWeekday: fields.includeTodayWeekday.checked,
            enableCopyButton: fields.enableCopyButton.checked,
            includeHeaderInCopy: fields.includeHeaderInCopy.checked
        };
        await chrome.storage.sync.set(newSettings);
        updateSubOptionsState();
    }

    // イベントリスナー登録
    fields.enableSearchTitle.addEventListener("change", saveSettings);
    fields.searchTitleFormat.addEventListener("change", saveSettings);
    fields.enableWeekday.addEventListener("change", saveSettings);
    fields.weekdayColorize.addEventListener("change", saveSettings);
    fields.includeTodayWeekday.addEventListener("change", saveSettings);
    fields.enableCopyButton.addEventListener("change", saveSettings);
    fields.includeHeaderInCopy.addEventListener("change", saveSettings);
});
