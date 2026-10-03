(() => {
    "use strict";

    // 設定の初期値
    const settings = {
        enableSearchTitle: true,
        searchTitleFormat: "query_prefix",
        enableWeekday: true,
        weekdayColorize: true,
        includeTodayWeekday: true,
        enableCopyButton: true,
        includeHeaderInCopy: false
    };

    // アイコンSVG定数
    const ICONS = {
        copy: `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
        check: `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>`
    };

    const WEEKDAYS = ["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"];

    // 設定のロードと同期
    chrome.storage.sync.get(settings, (items) => {
        Object.assign(settings, items);
        updateAll();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync") {
            for (const [key, change] of Object.entries(changes)) {
                settings[key] = change.newValue;
            }
            updateAll();
        }
    });

    /* ==========================================================================
       機能1: 検索したときにタブタイトルを変える
       ========================================================================== */
    let isApplyingTitle = false;
    let customTitleApplied = null;

    function getSearchQuery() {
        // 1. URLのハッシュから取得 (#search/...)
        const hash = window.location.hash || "";
        const searchPrefix = "#search/";
        if (hash.startsWith(searchPrefix)) {
            const rawQuery = hash.slice(searchPrefix.length);
            try {
                return decodeURIComponent(rawQuery.replace(/\+/g, " ")).trim();
            } catch {
                return rawQuery.replace(/\+/g, " ").trim();
            }
        }

        // 2. 検索ボックスの値からフォールバック
        const searchInput = document.querySelector(
            'input[name="q"], input[aria-label*="検索"], input[aria-label*="Search"]'
        );
        if (
            searchInput &&
            searchInput.value.trim() &&
            (hash.includes("search") || hash === "" || hash === "#inbox")
        ) {
            // URLが検索画面であるか、現在検索結果が表示されている場合
            const isSearchResultPage =
                document.querySelector('div[role="main"]') &&
                hash.includes("search");
            if (isSearchResultPage) {
                return searchInput.value.trim();
            }
        }

        return null;
    }

    function formatSearchTitle(query) {
        switch (settings.searchTitleFormat) {
            case "query_brackets":
                return `[${query}] - Gmail`;
            case "query_only":
                return `${query} - Gmail`;
            case "query_prefix":
            default:
                return `🔍 ${query} - Gmail`;
        }
    }

    function updateTabTitle() {
        if (!settings.enableSearchTitle) {
            if (customTitleApplied && document.title === customTitleApplied) {
                customTitleApplied = null;
            }
            return;
        }

        const query = getSearchQuery();
        if (query) {
            const targetTitle = formatSearchTitle(query);
            if (document.title !== targetTitle) {
                isApplyingTitle = true;
                customTitleApplied = targetTitle;
                document.title = targetTitle;
                setTimeout(() => {
                    isApplyingTitle = false;
                }, 50);
            }
        } else {
            // 検索画面ではない場合、カスタムタイトルのトラッキングを解除
            customTitleApplied = null;
        }
    }

    // <title> 要素の変更を監視してGmailの自動上書きを抑制
    const titleElement = document.querySelector("title");
    if (titleElement) {
        const titleObserver = new MutationObserver(() => {
            if (isApplyingTitle) return;
            const query = getSearchQuery();
            if (query && settings.enableSearchTitle) {
                const targetTitle = formatSearchTitle(query);
                if (document.title !== targetTitle) {
                    updateTabTitle();
                }
            }
        });
        titleObserver.observe(titleElement, { childList: true });
    }

    /* ==========================================================================
       機能2: 曜日を日時に足す
       ========================================================================== */
    function parseDateString(str) {
        if (!str) return null;

        // 日本語形式: 2026年9月30日, 2026/09/30, 2026-09-30
        const ymdMatch = str.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
        if (ymdMatch) {
            const year = parseInt(ymdMatch[1], 10);
            const month = parseInt(ymdMatch[2], 10) - 1;
            const day = parseInt(ymdMatch[3], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) return date;
        }

        // 月日のみ形式: 9月30日 (年は今年または過去1年以内の該当日と推測)
        const mdMatch = str.match(/(\d{1,2})月(\d{1,2})日/);
        if (mdMatch) {
            const now = new Date();
            const month = parseInt(mdMatch[1], 10) - 1;
            const day = parseInt(mdMatch[2], 10);
            let date = new Date(now.getFullYear(), month, day);
            // 未来の日付になってしまった場合は前年とみなす
            if (date.getTime() > now.getTime() + 86400000 * 2) {
                date = new Date(now.getFullYear() - 1, month, day);
            }
            if (!isNaN(date.getTime())) return date;
        }

        // 英語形式など標準Date.parseで解釈可能な文字列
        const parsed = Date.parse(str);
        if (!isNaN(parsed)) {
            return new Date(parsed);
        }

        return null;
    }

    function getWeekdayInfo(date) {
        const day = date.getDay(); // 0: 日, 1: 月, ..., 6: 土
        const text = WEEKDAYS[day];
        let colorClass = "";
        if (settings.weekdayColorize) {
            if (day === 0) colorClass = "gmc-weekday-sun";
            else if (day === 6) colorClass = "gmc-weekday-sat";
        }
        return { text, colorClass };
    }

    function createWeekdaySpan(weekdayInfo) {
        const span = document.createElement("span");
        span.className = `gmc-weekday ${weekdayInfo.colorClass}`.trim();
        span.textContent = weekdayInfo.text;
        return span;
    }

    // メール一覧（受信トレイ、検索結果等）の日時処理
    function processInboxDates() {
        if (!settings.enableWeekday) {
            // 無効化されている場合は既存のカスタム要素を削除
            document
                .querySelectorAll(".gmc-weekday")
                .forEach((el) => el.remove());
            document
                .querySelectorAll("[data-gmc-date-done]")
                .forEach((el) => el.removeAttribute("data-gmc-date-done"));
            return;
        }

        // Gmailの一覧の日時セル (td.xW またはクラス名にxWを含む要素)
        const dateCells = document.querySelectorAll("td.xW, td.xW span");
        dateCells.forEach((cell) => {
            if (cell.closest(".gmc-weekday")) return;
            if (cell.classList.contains("gmc-weekday")) return;

            // すでに処理済みかつ内部テキストに変更がなければスキップ
            const currentText = cell.textContent.trim();
            if (cell.getAttribute("data-gmc-date-done") === currentText) {
                return;
            }

            // 既に曜日文字が含まれている場合はスキップ
            if (/\([日月火水木金土]\)/.test(currentText)) {
                cell.setAttribute("data-gmc-date-done", currentText);
                return;
            }

            // 日時情報の抽出: title属性またはaria-labelを最優先
            const titleAttr =
                cell.getAttribute("title") ||
                cell.getAttribute("aria-label") ||
                (cell.parentElement
                    ? cell.parentElement.getAttribute("title")
                    : null);
            let targetDate = parseDateString(titleAttr);

            // 時刻のみ（例: "14:30"）の場合
            const isTimeOnly = /^\d{1,2}:\d{2}$/.test(currentText);
            if (!targetDate && isTimeOnly) {
                if (settings.includeTodayWeekday) {
                    targetDate = new Date();
                }
            } else if (!targetDate) {
                // テキスト自体からパース
                targetDate = parseDateString(currentText);
            }

            if (targetDate) {
                const weekdayInfo = getWeekdayInfo(targetDate);

                // 既存のweekday要素があれば更新、なければ追加
                const existing = cell.querySelector(".gmc-weekday");
                if (existing) {
                    existing.className =
                        `gmc-weekday ${weekdayInfo.colorClass}`.trim();
                    existing.textContent = weekdayInfo.text;
                } else {
                    const span = createWeekdaySpan(weekdayInfo);
                    if (isTimeOnly) {
                        cell.insertBefore(span, cell.firstChild);
                    } else {
                        cell.appendChild(span);
                    }
                }
                cell.setAttribute(
                    "data-gmc-date-done",
                    cell.textContent.trim()
                );
            }
        });
    }

    // メール詳細画面の日時処理
    function processDetailDates() {
        if (!settings.enableWeekday) return;

        // 詳細画面の日時要素: .g3, span[title], span[aria-label]
        const detailDateElements = document.querySelectorAll(
            ".g3, .gH .gK .g3, div[data-message-id] .g3"
        );
        detailDateElements.forEach((el) => {
            const currentText = el.textContent.trim();
            if (el.getAttribute("data-gmc-date-done") === currentText) return;
            if (/\([日月火水木金土]\)/.test(currentText)) {
                el.setAttribute("data-gmc-date-done", currentText);
                return;
            }

            const titleAttr =
                el.getAttribute("title") || el.getAttribute("aria-label");
            let targetDate =
                parseDateString(titleAttr) || parseDateString(currentText);

            if (targetDate) {
                const weekdayInfo = getWeekdayInfo(targetDate);
                const existing = el.querySelector(".gmc-weekday");
                if (existing) {
                    existing.className =
                        `gmc-weekday ${weekdayInfo.colorClass}`.trim();
                    existing.textContent = weekdayInfo.text;
                } else {
                    const span = createWeekdaySpan(weekdayInfo);
                    el.appendChild(span);
                }
                el.setAttribute("data-gmc-date-done", el.textContent.trim());
            }
        });
    }

    /* ==========================================================================
       機能3: メールを開いたときに全文をコピーできるアイコンボタンを設置する
       ========================================================================== */
    function showToast(message) {
        let container = document.querySelector(".gmc-toast-container");
        if (!container) {
            container = document.createElement("div");
            container.className = "gmc-toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = "gmc-toast";
        toast.innerHTML = `
            <span class="gmc-toast-icon">${ICONS.check}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("gmc-toast-hide");
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 2500);
    }

    async function copyToClipboard(text, buttonElement) {
        try {
            await navigator.clipboard.writeText(text);

            if (buttonElement) {
                buttonElement.classList.add("gmc-copied");
                const originalSvg = buttonElement.innerHTML;
                buttonElement.innerHTML = ICONS.check;

                setTimeout(() => {
                    buttonElement.classList.remove("gmc-copied");
                    buttonElement.innerHTML = originalSvg;
                }, 1800);
            }

            showToast("メール本文をコピーしました");
        } catch (err) {
            console.error("クリップボードへのコピーに失敗しました:", err);
            showToast("コピーに失敗しました");
        }
    }

    // 指定されたメッセージ要素から本文テキストを綺麗に抽出
    function extractBodyText(messageContainer) {
        const bodyElement = messageContainer.querySelector(
            ".a3s.aiL, .a3s, div[dir='ltr']"
        );
        if (!bodyElement) return "";

        // クローンを作成して不要な要素を取り除く
        const clone = bodyElement.cloneNode(true);

        // 引用展開ボタンや非表示要素を削除
        const unneeded = clone.querySelectorAll(
            ".adP, [style*='display: none'], [style*='display:none']"
        );
        unneeded.forEach((el) => el.remove());

        let text = clone.innerText || clone.textContent || "";
        text = text.trim();

        if (settings.includeHeaderInCopy) {
            // ヘッダー（件名、送信者、日時）も付加
            const subjectEl = document.querySelector("h2.hP, .hP");
            const senderEl = messageContainer.querySelector(".gD, [email]");
            const dateEl = messageContainer.querySelector(".g3");

            const parts = [];
            if (subjectEl) parts.push(`件名: ${subjectEl.textContent.trim()}`);
            if (senderEl) {
                const name =
                    senderEl.getAttribute("name") ||
                    senderEl.textContent.trim();
                const email = senderEl.getAttribute("email");
                parts.push(`差出人: ${name}${email ? ` <${email}>` : ""}`);
            }
            if (dateEl) parts.push(`日時: ${dateEl.textContent.trim()}`);

            if (parts.length > 0) {
                return `${parts.join("\n")}\n\n${text}`;
            }
        }

        return text;
    }

    // 各メールメッセージのヘッダーにコピーボタンを配置
    function attachMessageCopyButtons() {
        if (!settings.enableCopyButton) {
            document
                .querySelectorAll(".gmc-copy-btn")
                .forEach((btn) => btn.remove());
            return;
        }

        // 個別メッセージコンテナ
        const messages = document.querySelectorAll(
            ".adn.ads, div[role='listitem'], div[data-message-id]"
        );
        messages.forEach((message) => {
            // すでにボタンが設置されているか確認
            if (message.querySelector(".gmc-copy-btn")) return;

            // 返信ボタンやその他オプションメニューがあるアクションエリアを探す
            const actionsArea = message.querySelector(
                ".bAK, .hk, [role='toolbar'], .ams"
            );
            // または返信ボタンの親要素
            const replyBtn = message.querySelector(
                '[aria-label*="返信"], [aria-label*="Reply"], [data-tooltip*="返信"]'
            );
            const targetContainer =
                actionsArea || (replyBtn ? replyBtn.parentElement : null);

            if (!targetContainer) return;

            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "gmc-copy-btn";
            copyBtn.setAttribute("data-tooltip", "メール本文をコピー");
            copyBtn.setAttribute("aria-label", "メール本文をコピー");
            copyBtn.setAttribute("title", "メール本文をコピー");
            copyBtn.innerHTML = ICONS.copy;

            copyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                const bodyText = extractBodyText(message);
                if (bodyText) {
                    copyToClipboard(bodyText, copyBtn);
                } else {
                    showToast("コピーする本文が見つかりませんでした");
                }
            });

            // 返信ボタンの直前またはコンテナの先頭に挿入
            if (replyBtn && replyBtn.parentElement === targetContainer) {
                targetContainer.insertBefore(copyBtn, replyBtn);
            } else {
                targetContainer.appendChild(copyBtn);
            }
        });
    }

    // 上部ツールバーにコピーボタンを配置
    function attachToolbarCopyButton() {
        if (!settings.enableCopyButton) {
            document
                .querySelectorAll(".gmc-toolbar-copy-btn")
                .forEach((btn) => btn.remove());
            return;
        }

        // スレッドビューの上部ツールバー
        const toolbars = document.querySelectorAll(
            'div[gh="tm"], div[role="toolbar"].G-atb'
        );
        toolbars.forEach((toolbar) => {
            if (toolbar.querySelector(".gmc-toolbar-copy-btn")) return;

            // スレッド詳細（戻るボタンが存在する画面）であるか確認
            const backBtn = toolbar.querySelector(
                '[aria-label*="戻る"], [aria-label*="Back"], [data-tooltip*="戻る"]'
            );
            if (!backBtn) return;

            const copyBtn = document.createElement("div");
            copyBtn.className =
                "gmc-toolbar-copy-btn T-I J-J5-Ji nf T-I-ax7 L3";
            copyBtn.setAttribute("role", "button");
            copyBtn.setAttribute("tabindex", "0");
            copyBtn.setAttribute("data-tooltip", "メール全文をコピー");
            copyBtn.setAttribute("aria-label", "メール全文をコピー");
            copyBtn.setAttribute("title", "メール全文をコピー");
            copyBtn.innerHTML = ICONS.copy;

            copyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();

                // 開いているメッセージ、または最新のメッセージの本文を取得
                const openMessages = Array.from(
                    document.querySelectorAll(".adn.ads, div[data-message-id]")
                );
                let targetMessage = null;

                // 展開されているメッセージを探す
                for (let i = openMessages.length - 1; i >= 0; i--) {
                    const msg = openMessages[i];
                    const body = msg.querySelector(".a3s");
                    if (body && body.offsetHeight > 0) {
                        targetMessage = msg;
                        break;
                    }
                }

                if (!targetMessage && openMessages.length > 0) {
                    targetMessage = openMessages[openMessages.length - 1];
                }

                if (targetMessage) {
                    const bodyText = extractBodyText(targetMessage);
                    if (bodyText) {
                        copyToClipboard(bodyText, copyBtn);
                    } else {
                        showToast("コピーする本文が見つかりませんでした");
                    }
                } else {
                    // 全体の .a3s を直接検索
                    const fallbackBody = document.querySelector(".a3s");
                    if (fallbackBody) {
                        copyToClipboard(fallbackBody.innerText.trim(), copyBtn);
                    } else {
                        showToast("コピーする本文が見つかりませんでした");
                    }
                }
            });

            // 戻るボタンの近くに配置
            backBtn.insertAdjacentElement("afterend", copyBtn);
        });
    }

    /* ==========================================================================
       統合実行とDOM監視 (MutationObserver)
       ========================================================================== */
    let debounceTimer = null;
    function updateAll() {
        updateTabTitle();
        processInboxDates();
        processDetailDates();
        attachMessageCopyButtons();
        attachToolbarCopyButton();
    }

    function onDomChanged() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateAll();
        }, 120);
    }

    // URL変更の検知 (hashchange / popstate)
    window.addEventListener("hashchange", () => {
        setTimeout(updateAll, 50);
    });
    window.addEventListener("popstate", () => {
        setTimeout(updateAll, 50);
    });

    // 初期実行
    updateAll();

    // DOM変更の監視
    const observer = new MutationObserver(onDomChanged);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
