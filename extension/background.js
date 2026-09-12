const TRACKER_URL = "https://ypc0701-cmyk.github.io/Job-searching-tracker/";
const RESUME_TAGS = ["Business Intelligence", "Communication", "Data Analytics", "Marketing Analytics", "Product Management", "Supply Chain"];
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const isOverloaded = (status, msg) => status === 503 || status === 429 || /high demand|overloaded/i.test(msg || "");

function notify(title, message) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message: message.slice(0, 300) });
}

// 執行狀態寫入 storage：popup 重新打開時可看到進度與結果（系統通知可能被 OS 擋掉）
function setRun(stage, extra = {}) {
    return chrome.storage.local.set({ lastRun: { time: Date.now(), stage, ...extra } });
}

async function callGemini(apiKey, body) {
    let lastErr = null;
    for (const model of GEMINI_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await resp.json();
            if (resp.ok) return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const msg = result?.error?.message || `HTTP ${resp.status}`;
            if (!isOverloaded(resp.status, msg)) throw new Error(msg);
            lastErr = new Error(msg);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw lastErr;
}

// 在職缺頁面上執行：逐步捲動觸發延遲載入、展開 See more
function expandJD() {
    window.scrollBy(0, 500);
    let desc = document.querySelector('[data-testid="expandable-text-box"], #job-details, .jobs-description__content, .jobs-box__html-content');
    if (location.hostname.includes('joinhandshake.com') || location.hostname.includes('indeed.com')) {
        const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
            .find(el => el.textContent?.trim().toLowerCase() === 'job description');
        desc = heading?.parentElement?.nextElementSibling || desc;
    }
    if (desc) desc.scrollIntoView({ block: 'center' });
    [...document.querySelectorAll('button')]
        .filter(b => /^more$|see more|show more|顯示更多|\.{3}\s*more|…\s*more/i.test(b.innerText?.trim() || ''))
        .forEach(b => b.click());
}

// 在職缺頁面上執行：抓取標題、公司、JD 全文、Easy Apply 與否
//
// 規則：每個平台只用「語意化屬性／穩定 ID／文字內容錨點」精準定位 JD 容器，只讀取
// 該節點的 innerText。絕不掃描整個頁面找 JD——找不到就回傳空字串，交由呼叫端重試
// 或回報失敗，不做「掃全頁猜一塊像 JD 的內容」這種退路。
//
// LinkedIn：class 全是隨機雜湊（CSS Modules，如 `_8707df48`），改版就換，不能當選擇器。
//   穩定錨點是 `data-testid="expandable-text-box"`（LinkedIn 自己 QA 自動化用的屬性）。
// Handshake／Indeed：class 同樣是動態雜湊，穩定錨點是「文字完全等於 'Job description'
//   的 heading」→ 其父層 → 父層的下一個相鄰 div。
function extractJobInfo() {
    const isLinkedIn = location.hostname.includes('linkedin.com');
    const isHandshake = location.hostname.includes('joinhandshake.com');
    const isIndeed = location.hostname.includes('indeed.com');
    let title = "", company = "", jd = "", easyApply = false, closed = false;

    if (isLinkedIn) {
        const parts = document.title.replace(/^\(\d+\)\s*/, '').split('|').map(s => s.trim());
        if (parts.length >= 3) { title = parts[0]; company = parts[1]; }
        closed = /no longer accepting applications/i.test(document.body.innerText);
        easyApply = [...document.querySelectorAll('button')].some(b => /easy apply|快速應徵/i.test(b.innerText));

        // 主要規則：直接定位 data-testid，不掃全頁
        jd = document.querySelector('[data-testid="expandable-text-box"]')?.innerText?.trim() || "";

        // 備援規則：舊版 DOM（部分版型可能還沒切換到新 data-testid）——仍是精準選擇器，不是全頁掃描
        if (!jd || jd.length < 100) {
            jd = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content')?.innerText?.trim() || "";
        }
        // 找不到就是找不到，不做全頁掃描猜測
    } else if (isIndeed) {
        // Indeed /viewjob 頁面有穩定的 data-testid 與 ID，優先使用
        title = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText?.trim() || "";
        company = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() || "";

        // 主要規則：#jobDescriptionText 這個 ID 已穩定存在多年
        jd = document.querySelector('#jobDescriptionText')?.innerText?.trim() || "";

        // 備援：搜尋結果側欄版型沒有這個 ID，改用標題錨點。
        // 標題文字有「Job description」與「Full job description」兩種版型，用「結尾比對」涵蓋兩者
        if (!jd || jd.length < 100) {
            const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
                .find(el => /(?:^|\s)job description$/i.test(el.textContent?.trim() || ''));
            const content = heading?.parentElement?.nextElementSibling;
            if (content?.tagName === 'DIV') jd = content.innerText.trim();
        }
        if (jd) {
            jd = jd.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        }
        if (!title) {
            // 最後手段：document.title 慣例為「職稱 - 地點 - Indeed.com」，不含公司名，僅取職稱
            title = document.title.replace(/\s*-\s*Indeed(\.com)?\s*$/i, '').split(' - ')[0].trim();
        }
        closed = /no longer accepting|job (?:is )?closed|position filled|this job (?:has expired|is no longer available)/i.test(
            document.body.innerText.slice(0, 2000)
        );
    } else if (isHandshake) {
        // 注意：不能寫成 'main h1, h1' 合併查詢——CSS 選擇器清單是照「文件順序」
        // 合併結果，不是「main h1 優先、找不到才退回 h1」。Handshake 職缺頁在
        // <main> 外面另有一個文件順序更早的頁面標題 <h1>Jobs</h1>，合併查詢
        // 會抓到它，導致標題和公司名稱都從錯的地方找。只用 'main h1'。
        title = document.querySelector('main h1')?.innerText?.trim() || "";

        company = document.querySelector('[data-hook="employer-name"]')?.innerText?.trim() || "";
        if (!company) {
            // Handshake 雇主頁連結固定是 /e/<id> 這個網址樣式，比動態 class 穩定。
            // 同一個容器裡會命中好幾個這種連結（logo 圖示、公司名稱、產業標籤、
            // "Learn more about..." 等），文件順序最前面那個通常是空文字的 logo
            // 連結，要找「第一個有文字內容」的，不能直接取第一個比對到的。
            const h1 = document.querySelector('main h1');
            const container = h1?.closest('div');
            const links = container ? [...container.querySelectorAll('a[href^="/e/"]')] : [];
            company = links.map(a => a.innerText.trim()).find(t => t) || '';
        }

        // 錨點：h*(文字完全等於「Job description」) -> 父層 -> 下一個相鄰 div
        const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
            .find(el => el.textContent?.trim().toLowerCase() === 'job description');
        const content = heading?.parentElement?.nextElementSibling;
        if (content?.tagName === 'DIV') {
            jd = content.innerText
                .replace(/\u00a0/g, ' ')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        closed = /no longer accepting|job (?:is )?closed|position filled|this job (?:has expired|is no longer available)/i.test(
            heading?.closest('main,section,article')?.innerText || document.body.innerText.slice(0, 2000)
        );
    }
    // 其餘未支援的網站：不掃描頁面，直接回傳空 jd，交由呼叫端判定為擷取失敗

    return { title, company, jd, easyApply, closed, url: location.href.split('?')[0] };
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
    return new Promise(resolve => {
        const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') { cleanup(); resolve(); }
        };
        const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

// 重試抓取：內容為延遲載入，最多 8 次、每次間隔 1.5 秒，每次先捲動/展開
async function extractWithRetry(tabId) {
    for (let i = 0; i < 8; i++) {
        await setRun(`抓取職缺內容中（第 ${i + 1}/8 次）...`);
        try {
            await chrome.scripting.executeScript({ target: { tabId }, func: expandJD });
            const [{ result: job }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractJobInfo });
            if (job?.jd && job.jd.length >= 100) return job;
        } catch (e) {
            if (/cannot access|host permission/i.test(e.message)) {
                throw new Error('沒有這個網站的存取權限（僅支援 LinkedIn、Handshake、Indeed）');
            }
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return null;
}

async function analyze({ url, tabId }) {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) {
        await setRun('失敗', { ok: false, message: '請先在擴充功能視窗儲存 Gemini API Key' });
        notify('Career Hub', '請先在擴充功能視窗儲存 Gemini API Key');
        return;
    }

    let createdTabId = null;
    try {
        let targetTabId = tabId;
        if (url) {
            // 開啟「可見」分頁：LinkedIn 對背景分頁會延遲渲染，內容永遠載不出來
            await setRun('開啟職缺分頁中...');
            const newTab = await chrome.tabs.create({ url, active: true });
            createdTabId = newTab.id;
            targetTabId = newTab.id;
            await waitForTabComplete(targetTabId);
        }

        const job = await extractWithRetry(targetTabId);
        if (!job) throw new Error('抓不到 JD 內容。請確認網址是職缺頁面且仍開放中（已關閉的職缺不會顯示描述）');
        await setRun(`已抓取「${job.title || '未知職稱'}」，Gemini 分析中...`);

        const resumeLib = await fetch(chrome.runtime.getURL('resume-library.json')).then(r => r.json());
        const resumeSection = Object.entries(resumeLib)
            .map(([tag, text]) => `═══ 履歷版本「${tag}」═══\n${text.slice(0, 2600)}`)
            .join('\n\n');

        const systemPrompt = `妳是 Chloe 的職業顧問。請分兩步驟進行分析：
第一步：從 Chloe 的六份履歷版本中，比對各版本的具體經歷描述與 JD 要求的重疊程度，選出最適合這個職缺的一份（不要只看版本名稱）。
第二步：只針對第一步選定的那份履歷版本裡的具體經歷內容，評估與此 JD 的相符程度並打分數——分數代表「如果 Chloe 投遞這份被選定的履歷，適配程度有多高」，不是她的整體背景或其他未選中版本的經歷。

候選人背景：MSBA 學生（Boston University，2027/1 畢業）。

以下是 Chloe 六份履歷版本的完整內容：

${resumeSection}

請嚴格遵守以下格式與順序輸出，不要加任何其他文字（先選履歷，再根據選定的履歷打分數）：
職稱: [名稱]
公司: [名稱]
類別: [Intern/Full-time]
工作型態: [On-site/Remote/Hybrid]
薪資: [範圍，未提供則寫 未提供]
建議履歷: [${RESUME_TAGS.join('、')} 其中之一]
履歷理由: [一句話說明為何這份履歷的哪些具體經歷最貼合 JD]
分數: [0-10，只根據上面「建議履歷」選定版本裡的具體經歷內容評分，不要參考其他版本或泛泛的整體背景]
理由: [兩句話總結適配點，需緊扣選定履歷版本裡的具體經歷]
建議: [對策]`;

        const aiText = await callGemini(geminiKey, {
            contents: [{ parts: [{ text: `JD內容:\n${job.jd.slice(0, 12000)}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        });
        if (!aiText) throw new Error('Gemini 未回傳分析內容');

        const grab = (label) => {
            const m = aiText.match(new RegExp(`${label}[:：]\\s*(.+)`));
            return m ? m[1].trim() : "";
        };
        const resumeTagRaw = grab('建議履歷');
        const resumeTag = RESUME_TAGS.find(t => resumeTagRaw.includes(t)) || "";

        const payload = {
            title: job.title || grab('職稱'),
            company: job.company || grab('公司'),
            category: grab('類別'),
            type: grab('工作型態'),
            score: parseFloat((grab('分數').match(/[\d.]+/) || [0])[0]) || 0,
            salary: grab('薪資'),
            jobUrl: job.url,
            resumeTag,
            easyApply: job.easyApply,
            notes: `${job.closed ? '⚠️【注意】此職缺已停止收件（No longer accepting applications）\n\n' : ''}【建議履歷】${resumeTag || resumeTagRaw}\n${grab('履歷理由')}\n\n【分析理由】\n${grab('理由')}\n\n【對策建議】\n${grab('建議')}`
        };

        if (createdTabId) { await chrome.tabs.remove(createdTabId).catch(() => {}); createdTabId = null; }

        await setRun('匯入 Career Hub 中...');
        // UTF-8 → base64（service worker 環境不用 unescape）
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        const encoded = btoa(bin);
        await chrome.tabs.create({ url: `${TRACKER_URL}#import=${encoded}` });
        const doneMsg = `${payload.title}｜分數 ${payload.score}｜建議履歷：${resumeTag || '未指定'}`;
        await setRun('✓ 完成', { ok: true, message: doneMsg });
        notify('✓ 已匯入 Career Hub', doneMsg);
    } catch (e) {
        console.error('analyze failed:', e);
        await setRun('失敗', { ok: false, message: e.message });
        notify('匯入失敗', e.message);
    } finally {
        if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => {});
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'analyze') analyze(msg);
});
