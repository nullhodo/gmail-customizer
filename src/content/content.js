(() => {
    "use strict";

    // 設定の初期値
    const settings = {
        enableSearchTitle: true,
        searchTitleFormat: "query_only",
        enableWeekday: true,
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

    // メール詳細画面（スレッド表示）を開いているかどうか判定
    function isEmailDetailView() {
        // 1. URLハッシュによる判定:
        // 検索結果からメールを開いた場合: #search/{words}/{threadId}
        // 受信トレイ等からメールを開いた場合: #inbox/{threadId}, #label/{name}/{threadId} など
        const hash = window.location.hash || "";
        const searchPrefix = "#search/";
        if (hash.startsWith(searchPrefix)) {
            const rawAfterSearch = hash.slice(searchPrefix.length);
            // 検索クエリの後にスラッシュでスレッドIDが付いている場合はメール詳細
            if (rawAfterSearch.includes("/")) {
                return true;
            }
        } else if (
            hash.startsWith("#inbox/") ||
            hash.startsWith("#starred/") ||
            hash.startsWith("#sent/") ||
            hash.startsWith("#trash/") ||
            hash.startsWith("#spam/") ||
            hash.startsWith("#snoozed/") ||
            hash.startsWith("#all/") ||
            hash.startsWith("#label/")
        ) {
            const parts = hash.split("/");
            if (
                hash.startsWith("#label/") ? parts.length > 2 : parts.length > 1
            ) {
                return true;
            }
        }

        // 2. DOM要素による判定: 件名ヘッダー(h2.hP)やメッセージ本文(.adn.ads)の存在
        const hasDetailDOM = document.querySelector(
            "h2.hP, .hP, .adn.ads, div[data-message-id]"
        );
        if (hasDetailDOM) {
            return true;
        }

        return false;
    }

    function getSearchQuery() {
        // メール詳細画面を開いている場合は検索一覧タイトル変更の対象外
        if (isEmailDetailView()) {
            return null;
        }

        // 1. URLのハッシュから取得 (#search/...)
        const hash = window.location.hash || "";
        const searchPrefix = "#search/";
        if (hash.startsWith(searchPrefix)) {
            const rawQuery = hash.slice(searchPrefix.length);
            // スレッドID等の階層が含まれる場合はスキップ
            if (rawQuery.includes("/")) {
                return null;
            }
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
            hash.startsWith("#search/") &&
            !hash.slice("#search/".length).includes("/")
        ) {
            // URLが検索結果一覧画面である場合のみ
            const isSearchResultPage =
                document.querySelector('div[role="main"]') &&
                !document.querySelector("h2.hP, .hP, .adn.ads");
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
            default:
                return `${query} - Gmail`;
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
            if (customTitleApplied && document.title === customTitleApplied) {
                const subjectEl = document.querySelector("h2.hP, .hP");
                if (subjectEl && subjectEl.textContent.trim()) {
                    document.title = `${subjectEl.textContent.trim()} - Gmail`;
                }
            }
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
        return { text };
    }

    function createWeekdaySpan(weekdayInfo) {
        const span = document.createElement("span");
        span.className = "gmc-weekday";
        span.textContent = weekdayInfo.text;
        return span;
    }

    // 要素内から.gmc-weekdayを除いた本来のテキストを取得
    function getRawText(element) {
        let text = "";
        element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (
                node.nodeType === Node.ELEMENT_NODE &&
                !node.classList.contains("gmc-weekday")
            ) {
                text += getRawText(node);
            }
        });
        return text.trim();
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

        // Gmailの一覧の日時セル (各行の td.xW のみを対象にし、子孫spanは対象にしない)
        const dateCells = document.querySelectorAll("td.xW");
        dateCells.forEach((cell) => {
            // セル内の既存のgmc-weekday要素を調査
            const existingWeekdays = cell.querySelectorAll(".gmc-weekday");
            if (existingWeekdays.length > 1) {
                // 2つ以上ある場合は1つだけ残して余分なものを削除
                for (let i = 1; i < existingWeekdays.length; i++) {
                    existingWeekdays[i].remove();
                }
            }

            // 拡張機能による追加要素を除いた元のテキストを取得
            const rawText = getRawText(cell);
            if (!rawText) return;

            // 既にGmail自体が曜日を出している場合は既存の付加要素があれば削除してスキップ
            if (/\([日月火水木金土]\)/.test(rawText)) {
                if (existingWeekdays.length > 0) {
                    existingWeekdays[0].remove();
                }
                return;
            }

            // すでに処理済みかつ内部テキストに変更がなければスキップ
            if (
                cell.getAttribute("data-gmc-date-done") === rawText &&
                existingWeekdays.length === 1
            ) {
                return;
            }

            // 日時情報の抽出: title属性またはaria-labelを優先
            const titleEl = cell.querySelector("[title]") || cell;
            const ariaEl = cell.querySelector("[aria-label]") || cell;
            const titleAttr =
                titleEl.getAttribute("title") ||
                ariaEl.getAttribute("aria-label") ||
                (cell.parentElement
                    ? cell.parentElement.getAttribute("title")
                    : null);
            let targetDate = parseDateString(titleAttr);

            // 時刻のみ（例: "14:30"）の場合
            const isTimeOnly = /^\d{1,2}:\d{2}$/.test(rawText);
            if (!targetDate && isTimeOnly) {
                if (settings.includeTodayWeekday) {
                    targetDate = new Date();
                }
            } else if (!targetDate) {
                // テキスト自体からパース
                targetDate = parseDateString(rawText);
            }

            if (targetDate) {
                const weekdayInfo = getWeekdayInfo(targetDate);

                // 既存のweekday要素があれば更新、なければ追加
                const existing = cell.querySelector(".gmc-weekday");
                if (existing) {
                    existing.textContent = weekdayInfo.text;
                } else {
                    const span = createWeekdaySpan(weekdayInfo);
                    // 表示用要素（span）があればその中、なければセル内に配置
                    const targetContainer =
                        cell.querySelector("span[title]") ||
                        cell.querySelector("span") ||
                        cell;
                    if (isTimeOnly) {
                        targetContainer.insertBefore(
                            span,
                            targetContainer.firstChild
                        );
                    } else {
                        targetContainer.appendChild(span);
                    }
                }
                cell.setAttribute("data-gmc-date-done", rawText);
            }
        });
    }

    // メール詳細画面の日時処理
    function processDetailDates() {
        if (!settings.enableWeekday) {
            document
                .querySelectorAll(".g3 .gmc-weekday")
                .forEach((el) => el.remove());
            return;
        }

        // 詳細画面の日時要素: .g3
        const detailDateElements = document.querySelectorAll(".g3");
        detailDateElements.forEach((el) => {
            const existingWeekdays = el.querySelectorAll(".gmc-weekday");
            if (existingWeekdays.length > 1) {
                for (let i = 1; i < existingWeekdays.length; i++) {
                    existingWeekdays[i].remove();
                }
            }

            const rawText = getRawText(el);
            if (!rawText) return;

            if (/\([日月火水木金土]\)/.test(rawText)) {
                if (existingWeekdays.length > 0) {
                    existingWeekdays[0].remove();
                }
                return;
            }

            if (
                el.getAttribute("data-gmc-date-done") === rawText &&
                existingWeekdays.length === 1
            ) {
                return;
            }

            const titleAttr =
                el.getAttribute("title") || el.getAttribute("aria-label");
            let targetDate =
                parseDateString(titleAttr) || parseDateString(rawText);

            if (targetDate) {
                const weekdayInfo = getWeekdayInfo(targetDate);
                const existing = el.querySelector(".gmc-weekday");
                if (existing) {
                    existing.textContent = weekdayInfo.text;
                } else {
                    const span = createWeekdaySpan(weekdayInfo);
                    el.appendChild(span);
                }
                el.setAttribute("data-gmc-date-done", rawText);
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

            const copyBtn = document.createElement("div");
            copyBtn.setAttribute("role", "button");
            copyBtn.setAttribute("tabindex", "0");
            copyBtn.className = "gmc-copy-btn";
            copyBtn.setAttribute("data-tooltip", "メール本文をコピー");
            copyBtn.setAttribute("aria-label", "メール本文をコピー");
            copyBtn.setAttribute("title", "メール本文をコピー");
            copyBtn.innerHTML = ICONS.copy;

            // 返信ボタンがある場合、高さや垂直アライメント、マージンを同期してy軸のズレを解消
            if (replyBtn) {
                const replyComputed = window.getComputedStyle(replyBtn);
                if (replyComputed) {
                    if (
                        replyComputed.verticalAlign &&
                        replyComputed.verticalAlign !== "baseline"
                    ) {
                        copyBtn.style.verticalAlign =
                            replyComputed.verticalAlign;
                    }
                    if (
                        replyComputed.height &&
                        replyComputed.height !== "auto"
                    ) {
                        copyBtn.style.height = replyComputed.height;
                        copyBtn.style.width = replyComputed.height;
                    }
                    if (replyComputed.marginTop) {
                        copyBtn.style.marginTop = replyComputed.marginTop;
                    }
                    if (replyComputed.marginBottom) {
                        copyBtn.style.marginBottom = replyComputed.marginBottom;
                    }
                }
            }

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

            copyBtn.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    copyBtn.click();
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
