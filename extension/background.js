const TRACKER_URL = "https://ypc0701-cmyk.github.io/Job-searching-tracker/";
const RESUME_TAGS = ["Business Intelligence", "Communication", "Data Analytics", "Marketing Analytics", "Product Management", "Supply Chain"];
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
// 跟 index.html 的 US_STATES 保持一致（兩份各自維護，extension 沒有連到 Firestore 沒辦法共用常數）
const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
    'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];
// Handshake「At a glance」區塊的地點文字是縮寫（例如 "MA"），這裡轉成 US_STATES 的完整州名
const STATE_ABBR_TO_NAME = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
    LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
    OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
const isOverloaded = (status, msg) => status === 503 || status === 429 || /high demand|overloaded/i.test(msg || "");

// 跟 index.html 的 buildProfileResumeContext() 保持邏輯一致（兩份各自維護，extension
// 沒有連到 Firestore，只能靠 content-sync.js 轉送網站 postMessage 來的 Profile 快照）。
// 把結構化 Profile 轉成條列純文字，當作「候選人背景」餵給 Gemini。
function buildProfileContextText(profile) {
    if (!profile) return null;
    const lines = [];
    if (profile.experience?.length) {
        lines.push('Experience:');
        profile.experience.forEach(e => {
            lines.push(`- ${e.title || ''}${e.company ? ` at ${e.company}` : ''}${e.type ? ` (${e.type})` : ''}, ${[e.startDate, e.endDate].filter(Boolean).join(' - ')}`);
            if (e.description) lines.push(`  ${e.description}`);
        });
    }
    if (profile.education?.length) {
        lines.push('\nEducation:');
        profile.education.forEach(e => {
            lines.push(`- ${e.degree || ''}${e.school ? `, ${e.school}` : ''}${e.department ? ` (${e.department})` : ''}, ${[e.startDate, e.endDate].filter(Boolean).join(' - ')}`);
        });
    }
    if (profile.languages?.length) {
        lines.push('\nLanguages:');
        profile.languages.forEach(l => lines.push(`- ${l.language || ''}: ${l.proficiency || ''}`));
    }
    if (profile.skills?.length) lines.push(`\nSkills: ${profile.skills.join(', ')}`);
    if (profile.courses?.length) lines.push(`\nCourses: ${profile.courses.join(', ')}`);
    if (profile.organizations?.length) {
        lines.push('\nOrganizations:');
        profile.organizations.forEach(o => lines.push(`- ${o.role || ''}${o.org ? ` at ${o.org}` : ''}, ${[o.startDate, o.endDate].filter(Boolean).join(' - ')}`));
    }
    if (profile.projects?.length) {
        lines.push('\nProjects:');
        profile.projects.forEach(pr => {
            lines.push(`- ${pr.title || ''}${pr.type ? ` (${pr.type})` : ''}`);
            if (pr.description) lines.push(`  ${pr.description}`);
        });
    }
    return lines.length ? lines.join('\n') : null;
}

function notify(title, message) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message: message.slice(0, 300) });
}

// 執行狀態寫入 storage：popup 重新打開時可看到進度與結果（系統通知可能被 OS 擋掉）
function setRun(stage, extra = {}) {
    return chrome.storage.local.set({ lastRun: { time: Date.now(), stage, ...extra } });
}

// ── 背景穩定性機制：keepalive + 卡住自我偵測 + 失敗自動重試 ──────────────
//
// MV3 的 background service worker 閒置一段時間、或執行太久，會被 Chrome
// 直接砍掉，這不是 JS 例外，try/catch/finally 都救不回來。用 chrome.alarms
// 做兩件事：
//   1) keepalive：執行期間每 30 秒觸發一次 alarm，喚醒/維持 service worker
//      不被判定為閒置，降低中途被砍的機率（降低機率，無法完全避免——
//      Chrome 仍可能強制回收，所以下面第 2 點的偵測還是必要的）。
//   2) 卡住自我偵測：另外排一個「這次執行理論上最晚該有結果」的一次性
//      alarm。即使原本執行的 service worker 真的被砍了，alarm 觸發時
//      Chrome 會喚醒一個新的 service worker 執行這段程式碼，檢查上次
//      狀態是否還卡在「進行中」，是的話視為失敗並交給重試機制——
//      不需要使用者手動發現、也不需要原本的執行續存活。
//
// STALE_AFTER_SEC 要蓋過「最糟但正常」的單次執行耗時：抓取最多 8 次
// retry（約 16 秒）+ 開分頁等待（最多 20 秒）+ Gemini 最多 2 模型 x 2
// 次重試 x 45 秒逾時（最多約 190 秒），抓寬一點用 240 秒。
const STALE_AFTER_SEC = 240;
const KEEPALIVE_ALARM = 'career-hub-keepalive';
const STALE_CHECK_ALARM_PREFIX = 'career-hub-stale-check-';
const MAX_ATTEMPTS = 3;

function startKeepalive() {
    // periodInMinutes 的最小值是 0.5（30 秒），同名 alarm 會直接覆蓋，重複呼叫安全
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
}
function stopKeepalive() {
    chrome.alarms.clear(KEEPALIVE_ALARM);
}

async function cleanupRun(runId) {
    stopKeepalive();
    if (runId) chrome.alarms.clear(`${STALE_CHECK_ALARM_PREFIX}${runId}`);
    await chrome.storage.local.remove('pendingAnalyze');
}

// 失敗（含偵測到卡住）統一入口：還有重試次數就自動重跑，否則才是最終失敗
async function handleAnalyzeFailure(pending, err) {
    const { url, tabId, runId, attempt } = pending;
    console.error('analyze failed:', err);
    if (attempt < MAX_ATTEMPTS) {
        chrome.alarms.clear(`${STALE_CHECK_ALARM_PREFIX}${runId}`);
        await setRun(`第 ${attempt}/${MAX_ATTEMPTS} 次嘗試失敗（${err.message}），3 秒後自動重試...`);
        await new Promise(r => setTimeout(r, 3000));
        analyze({ url, tabId }, attempt + 1);
    } else {
        await cleanupRun(runId);
        const msg = `已自動重試 ${MAX_ATTEMPTS} 次仍失敗：${err.message}`;
        await setRun('失敗', { ok: false, message: msg });
        notify('匯入失敗', msg);
    }
}

// alarm 觸發時（可能是全新喚醒的 service worker），檢查這個 runId 是否還卡在進行中
async function checkStaleRun(runId) {
    const { lastRun, pendingAnalyze } = await chrome.storage.local.get(['lastRun', 'pendingAnalyze']);
    // 不是同一筆執行、或已經有成功/失敗結果了，代表正常結束或已被新的一次分析取代，不處理
    if (!pendingAnalyze || pendingAnalyze.runId !== runId || lastRun?.ok !== undefined) return;
    await handleAnalyzeFailure(pendingAnalyze, new Error(`執行超過 ${STALE_AFTER_SEC} 秒沒有回應（背景執行可能已被中斷）`));
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) return; // 只是喚醒/維持 service worker，不用做事
    if (alarm.name.startsWith(STALE_CHECK_ALARM_PREFIX)) {
        checkStaleRun(alarm.name.slice(STALE_CHECK_ALARM_PREFIX.length));
    }
});

const GEMINI_TIMEOUT_MS = 45000;

// fetch 沒有內建逾時，呼叫卡住時 await 會無限等待，連 analyze() 的
// try/catch 都救不回來（因為根本沒有拋出錯誤）。用 AbortController 強制
// 在時間到時中止，讓卡住的呼叫也能變成一個可以被 catch 到的錯誤。
async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(apiKey, body) {
    let lastErr = null;
    for (const model of GEMINI_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            let resp;
            try {
                resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }, GEMINI_TIMEOUT_MS);
            } catch (e) {
                if (e.name === 'AbortError') {
                    lastErr = new Error(`呼叫 ${model} 逾時（${GEMINI_TIMEOUT_MS / 1000} 秒無回應）`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw e;
            }
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
    let salary = "", location_ = "", jobType = "", workAuth = "";

    if (isLinkedIn) {
        const parts = document.title.replace(/^\(\d+\)\s*/, '').split('|').map(s => s.trim());
        if (parts.length >= 3) { title = parts[0]; company = parts[1]; }

        // 備援規則：document.title 格式跑掉時（例如版型改了、介面語言不是英文導致
        // 「| LinkedIn」這段文字不同，split('|') 就湊不出 3 段），改用頁面上的穩定
        // 網址樣式——公司名稱固定連到 /company/<slug>/、職缺標題連結固定是
        // /jobs/view/<職缺ID>（用目前分頁網址裡的職缺 ID 鎖定，避免抓到側邊欄
        // 「相似職缺」裡其他職缺的標題連結）。不是 class，class 一樣是動態雜湊不能用。
        if (!company) {
            company = document.querySelector('a[href*="linkedin.com/company/"]')?.innerText?.trim() || "";
        }
        if (!title) {
            const jobIdMatch = location.pathname.match(/\/jobs\/view\/(\d+)/);
            if (jobIdMatch) {
                title = document.querySelector(`a[href*="/jobs/view/${jobIdMatch[1]}"]`)?.innerText?.trim() || "";
            }
        }

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
        if (!company) {
            // 第二備援：有些版型公司名稱不是連結，是職稱 h1 正上方那一行純文字
            // （沒有 data-hook、也不是 /e/ 連結，驗證過的真實頁面確實有這種版型）。
            // h1 的「上一個相鄰元素」就是這行文字，不用猜 class。
            company = document.querySelector('main h1')?.previousElementSibling?.innerText?.trim() || "";
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

        // 「At a glance」區塊（薪資／地點／工作型態／工作許可）：跟 JD 全文一樣，
        // class 是動態雜湊不能當選擇器，用「文字完全等於 'At a glance' 的 heading」
        // -> 往上找共同容器 -> 每一行用內容本身的樣式分類（不是位置），因為職缺之間
        // 顯示的行數／順序不保證一致（例如沒有強制工作許可要求時，整行就不會出現）。
        // 這些是 Handshake 自己結構化標出來的資料，比 Gemini 從 JD 全文猜測準確，
        // 之後在 analyze() 裡會優先採用這裡抓到的值，Gemini 的猜測只當退路。
        const glanceHeading = [...document.querySelectorAll('h1,h2,h3,h4')]
            .find(el => el.textContent?.trim().toLowerCase() === 'at a glance');
        const glanceContainer = glanceHeading?.parentElement?.parentElement;
        if (glanceContainer) {
            const rows = [...glanceContainer.querySelectorAll('svg')]
                .map(svg => svg.nextElementSibling)
                .filter(el => el && el.children && el.children.length);
            for (const row of rows) {
                const main = (row.children[0]?.innerText || '').trim();
                const sub = (row.children[1]?.innerText || '').trim();
                if (/\$[\d,]/.test(main)) {
                    salary = main.replace(/\s+/g, ' ').trim();
                } else if (main.toLowerCase() === 'job') {
                    jobType = sub;
                } else if (/^(remote|hybrid|on-?site)/i.test(main)) {
                    location_ = main;
                }
            }
            // 工作許可那一行有獨立的語意化屬性 data-hook，比其他行更穩定，直接查就好
            workAuth = document.querySelector('[data-hook="work-auth-title"]')?.innerText?.trim() || "";
        }
    }
    // 其餘未支援的網站：不掃描頁面，直接回傳空 jd，交由呼叫端判定為擷取失敗

    return {
        title, company, jd, easyApply, closed,
        salary, location: location_, jobType, workAuth,
        url: location.href.split('?')[0]
    };
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

// 已開著 Career Hub 就直接把資料交給那一頁，不開新分頁：
//  1) 新版網站有 window.__importJob，直接呼叫，頁面狀態（開著的表單、搜尋）都不受影響
//  2) 舊版網站（還沒部署新版）沒有這個函式，退回「換網址並重新載入」
//  3) 完全沒有 Career Hub 分頁時才開新的。都不會切換你目前的分頁。
async function sendToTracker(payload, encoded) {
    const tabs = await chrome.tabs.query({ url: `${TRACKER_URL}*` });
    for (const tab of tabs) {
        try {
            const [res] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: (p) => typeof window.__importJob === 'function' ? (window.__importJob(p), true) : false,
                args: [payload]
            });
            if (res?.result) return 'existing-tab';
        } catch (e) { /* 分頁被休眠或無法注入，試下一個 / 走備援 */ }
    }
    const url = `${TRACKER_URL}#import=${encoded}`;
    if (tabs.length) {
        // 只換 #hash 不會重新載入頁面；加一個每次不同的查詢字串強制完整導覽
        // （用 update 後再 reload 有時序問題，可能重新載入的還是沒有 hash 的舊網址）
        await chrome.tabs.update(tabs[0].id, { url: `${TRACKER_URL}?_=${Date.now()}#import=${encoded}` });
        return 'reloaded-tab';
    }
    await chrome.tabs.create({ url });
    return 'new-tab';
}

async function analyze({ url, tabId }, attempt = 1) {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) {
        await setRun('失敗', { ok: false, message: '請先在擴充功能視窗儲存 Gemini API Key' });
        notify('Career Hub', '請先在擴充功能視窗儲存 Gemini API Key');
        return;
    }

    // 第一次嘗試才產生新的 runId；重試（attempt > 1）沿用同一筆 pendingAnalyze 的 runId，
    // 這樣卡住偵測 alarm 才能正確比對「是不是同一次執行」
    const existing = (await chrome.storage.local.get('pendingAnalyze')).pendingAnalyze;
    const runId = attempt === 1 || !existing ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : existing.runId;
    await chrome.storage.local.set({ pendingAnalyze: { url, tabId, runId, attempt } });
    startKeepalive();
    chrome.alarms.create(`${STALE_CHECK_ALARM_PREFIX}${runId}`, { delayInMinutes: STALE_AFTER_SEC / 60 });

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

        // no-store: 履歷 JSON 由 scripts/sync_resumes.py 在背景覆蓋更新，
        // 每次分析都要讀到最新內容，不能吃快取，這樣換履歷後不需要 Reload extension。
        const resumeLib = await fetch(chrome.runtime.getURL('resume-library.json'), { cache: 'no-store' }).then(r => r.json());
        const resumeSection = Object.entries(resumeLib)
            .map(([tag, text]) => `═══ 履歷版本「${tag}」═══\n${text.slice(0, 2600)}`)
            .join('\n\n');

        // 候選人背景：優先用 content-sync.js 從 Career Hub 網站同步過來的真實 Profile
        // （見 buildProfileContextText()）；還沒同步過（例如剛裝好 extension、或從沒
        // 打開過一次 Career Hub 網站）才退回這個最基本的事實當保底，並在 prompt 裡
        // 明確告知 Gemini 背景資料不完整，Match Score 的可信度會受限。
        const { profileSnapshot } = await chrome.storage.local.get('profileSnapshot');
        const profileContextText = buildProfileContextText(profileSnapshot?.profile);
        const candidateBackgroundSection = profileContextText
            || `（Profile 尚未同步——請至少打開一次 Career Hub 網站讓 Profile 同步到這個瀏覽器。目前只知道：MSBA 學生，Boston University，2027/1 畢業。背景資料不完整，請在「分數落差說明」裡註明 Match Score 的可信度受限，並以 Resume Match Score 為主要參考。）`;

        const systemPrompt = `妳是 Chloe 的職業顧問，這次要算出兩個分數：

Match Score（對照 Chloe 本人真實經歷的客觀分數）：完全依據下面「候選人背景」判斷，不管任何履歷版本的文字寫法——即使某項技能只在候選人背景列出、沒寫進履歷版本，也要算有。這是「Chloe 實際上適合這份工作到什麼程度」，用來判斷值不值得投遞／做客製履歷，是存進 Career Hub 的主分數。

Resume Match Score（建議履歷本身對這份工作的分數）：先選出最適合的履歷版本，只依據那份履歷版本「實際的文字內容」重新計算，不可以參考候選人背景或其他履歷版本來補。這是「這份履歷現在的文字，能不能讓 ATS／招募方看出這個 fit」，用來判斷履歷文字要不要補強。

請依序完成：

第一步：從 Chloe 的六份履歷版本中，比對各版本的具體經歷描述與 JD 要求的重疊程度，選出最適合這個職缺的一份（不要只看版本名稱）。

第二步：用同一套公式分別計算兩次，來源資料不同、不可互相借用：
【Match Score 用這份來源】候選人背景整段。
【Resume Match Score 用這份來源】第一步選定那份履歷版本的實際文字，不可以參考候選人背景或其他履歷版本來補。

(A) 職責符合度，滿分 5 分：
把 JD 的主要職責拆成條列（通常 5-10 條）。每一條依該來源資料：完全對應給 1 分、部分對應／做過類似的事給 0.5 分、完全沒對應給 0 分。
職責符合度 = (所有條目分數總和 ÷ 條目數) × 5。

(B) 必填工具符合度，滿分 3 分：
只列出 JD 明確標示為「必要／基本資格」的工具與系統（required、must have、基本條件），不要把「加分項／優先／nice to have」的工具算進來——這些另外列出，不計分，僅供參考。
必填工具符合度 = (該來源資料能主張的必填工具數 ÷ 必填工具總數) × 3。一項工具只有在該來源資料明確提過才算有；JD 說「或同類工具」才能算近似工具相符，否則不算——籠統的上位詞不算明確提過（例如寫「Microsoft Office」不能當作寫了「Excel」，寫「Google Workspace」不能當作寫了「Google Sheets」）。
若 JD 完全沒有列出任何必填工具，直接給 1.5 分。

(C) 方向契合度，滿分 2 分（固定值，不按比例計算，兩次計算通常得出一樣的類別）：
- Product Management / Product Analyst 類職缺：2 分
- Business Intelligence / Data Analytics 類職缺：1.5 分
- Marketing Analytics / Growth Analytics 類職缺：1 分
- 其他分析類或營運類職缺：0.5 分
- 完全不相關（例如現場製作、客服、純銷售）：0 分

第三步：
Match Score = 候選人背景算出的（職責符合度＋必填工具符合度＋方向契合度），四捨五入到小數一位（0 到 10 分）。
Resume Match Score = 選定履歷版本文字算出的（職責符合度＋必填工具符合度＋方向契合度），四捨五入到小數一位（0 到 10 分）。
如果兩個分數有落差，簡短說明是哪裡造成的（通常是履歷版本文字沒有明確寫出候選人背景裡其實有的技能或經歷）。

評分時務必遵守：
- 忽略 JD 要求的「年資」，新鮮人／實習職缺的年資要求通常只是參考門檻，不要因為年資不符扣分。
- JD 提到的美國地點、是否需要簽證贊助（sponsorship），都不算扣分項目——候選人持 OPT 身份可合法在美工作，不需要雇主辦理簽證贊助。
- 只能引用該次計算來源資料裡明確出現的事實，不可編造、不可誇大。以下說法絕對不能出現：具體的業績配額百分比數字、ROAS 相關 dashboard、具體營收佔比數字、定價 A/B 測試、包裝策略建議、把任何探索性／實驗性模型描述成「成功預測」。

第四步：列出風險旗標（以候選人背景為準，不影響分數，沒有就寫「無風險」）：
- JD 要求「在校大學生」或「僅限大學部」
- JD 要求工程相關學位
- JD 要求安全許可
- 到職日期風險
- JD 明確寫不提供現在或未來的簽證贊助
- 需要常駐現場或頻繁出差
- JD 把候選人背景或所有履歷版本都沒有的經驗當作核心必要條件

候選人背景（只能引用以下事實，不可編造）：
${candidateBackgroundSection}

以下是 Chloe 六份履歷版本的完整內容：

${resumeSection}

請嚴格遵守以下格式與順序輸出，不要加任何其他文字（每個欄位限一行，多個項目用頓號分隔）：
職稱: [名稱]
公司: [名稱]
州: [只能是以下清單其中之一：${US_STATES.join('、')}；JD 沒提到或不是美國地點就留空]
城市: [城市名，JD 沒提到就留空]
類別: [Intern/Full-time，必須只根據 JD 原文的職稱與內文判斷（例如職稱或內文出現 Intern/Internship/實習/co-op 等字樣才填 Intern，否則填 Full-time）；不可因為候選人背景是學生就預設填 Intern，JD 完全沒提到的話就留空]
工作型態: [On-site/Remote/Hybrid]
薪資: [範圍，未提供則寫 未提供]
建議履歷: [${RESUME_TAGS.join('、')} 其中之一]
履歷理由: [一句話說明為何這份履歷的哪些具體經歷最貼合 JD]
背景職責符合度明細: [逐項列出 JD 職責與對應分數 1/0.5/0，依候選人背景評分，頓號分隔]
背景職責符合度分數: [0-5，一位小數，依候選人背景計算]
背景必填工具明細: [逐項列出 JD 必要工具與是否命中，依候選人背景判斷，頓號分隔；JD 沒列必填工具就寫 JD未列出必填工具]
背景必填工具分數: [0-3，一位小數，依候選人背景計算；JD 沒列必填工具固定給 1.5]
加分工具參考: [JD 列出的優先／加分工具，不計分，無則寫 無]
方向類別: [Product Management/Business Intelligence/Marketing Analytics/Other Analytical or Operations/Unrelated 其中之一]
方向分數: [0/0.5/1/1.5/2 其中之一，對應方向類別]
對照背景分數: [0到10，=背景職責符合度分數+背景必填工具分數+方向分數，四捨五入一位小數]
履歷職責符合度分數: [0-5，一位小數，只依建議履歷選定版本的實際文字計算，不可參考候選人背景]
履歷必填工具分數: [0-3，一位小數，只依建議履歷選定版本的實際文字計算，不可參考候選人背景；JD 沒列必填工具固定給 1.5]
對照履歷分數: [0到10，=履歷職責符合度分數+履歷必填工具分數+方向分數，四捨五入一位小數]
分數落差說明: [如果對照背景分數跟對照履歷分數不同，一句話說明是履歷版本文字沒有明確寫出候選人背景裡的哪些技能或經歷造成的；沒有落差就寫 履歷文字與候選人背景一致，無落差]
風險旗標: [逐項列出風險，用頓號分隔；沒有風險就寫 無風險]
分析理由: [兩句話總結，需緊扣上面的背景職責符合度與背景必填工具明細]
建議: [針對缺漏的必填工具與未覆蓋的職責，具體建議如何調整履歷內容以提高通過篩選的機率]
建議優先度: [對照背景分數大於等於6寫 分數達標建議製作客製化履歷；小於6寫 分數偏低暫不建議製作客製化履歷]`;

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
        const matchScoreRaw = grab('對照背景分數');

        // Gemini 偶爾不會照要求的格式輸出（尤其 JD 內容異常時），這種情況下
        // grab() 全部抓空、分數預設變 0，過去會被當成「成功」默默存進資料庫，
        // 使用者只看到「分數 0、建議履歷未指定」卻不知道哪裡出錯。現在直接
        // 視為失敗並附上 Gemini 原始回覆的開頭，方便判斷是不是內容本身有問題。
        if (!resumeTagRaw || !matchScoreRaw) {
            throw new Error(`Gemini 回覆格式不符預期，未包含「建議履歷」或「對照背景分數」欄位。原始回覆開頭：${aiText.slice(0, 200)}`);
        }

        // Handshake 的「At a glance」是網站自己結構化標出來的資料（見 extractJobInfo），
        // 比 Gemini 從 JD 全文猜測準確，優先採用；其他平台（LinkedIn/Indeed）沒有這個區塊，
        // 這些值自然是空字串，就照原本的方式退回 Gemini 的猜測。
        let domState = "", domCity = "", domType = "";
        const styleMatch = (job.location || "").match(/^(remote|hybrid|on-?site)/i);
        if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            domType = style.startsWith('remote') ? 'Remote' : style.startsWith('hybrid') ? 'Hybrid' : 'On-site';
        }
        const placeMatch = (job.location || "").match(/based in\s+([^,]+),\s*([A-Za-z]{2})\b/i);
        if (placeMatch) {
            domCity = placeMatch[1].trim();
            domState = STATE_ABBR_TO_NAME[placeMatch[2].toUpperCase()] || "";
        }
        const domCategory = job.jobType ? job.jobType.replace(/internship/i, 'Intern') : "";

        const payload = {
            title: job.title || grab('職稱'),
            company: job.company || grab('公司'),
            state: domState || grab('州'),
            city: domCity || grab('城市'),
            category: domCategory || grab('類別'),
            type: domType || grab('工作型態'),
            score: parseFloat((matchScoreRaw.match(/[\d.]+/) || [0])[0]) || 0,
            salary: job.salary || grab('薪資'),
            jobUrl: job.url,
            jobDescription: job.jd,
            resumeTag,
            easyApply: job.easyApply,
            notes: `${job.closed ? '⚠️【注意】此職缺已停止收件（No longer accepting applications）\n\n' : ''}${job.workAuth ? `🛂【地點要求】${job.workAuth}\n\n` : ''}${!profileContextText ? '⚠️【Profile 未同步】目前用最基本的背景資訊估算，建議打開一次 Career Hub 網站同步 Profile 後重新分析\n\n' : ''}【建議履歷】${resumeTag || resumeTagRaw}\n${grab('履歷理由')}\n\n【評分明細 — 對照 Profile】\n職責符合度：${grab('背景職責符合度分數') || '未評估'}/5（${grab('背景職責符合度明細') || '無資料'}）\n必填工具符合度：${grab('背景必填工具分數') || '未評估'}/3（${grab('背景必填工具明細') || '無資料'}）\n加分工具參考：${grab('加分工具參考') || '無'}\n方向契合度：${grab('方向類別') || '未評估'}（${grab('方向分數') || '未評估'}/2）\n對照背景分數：${matchScoreRaw || '未評估'}/10\n\n【對照履歷版本「${resumeTag || resumeTagRaw}」實際文字】\n對照履歷分數：${grab('對照履歷分數') || '未評估'}/10\n${grab('分數落差說明') || ''}\n\n【風險旗標】\n${grab('風險旗標') || '無風險'}\n\n【分析理由】\n${grab('分析理由')}\n\n【對策建議】\n${grab('建議')}\n\n【優先度】\n${grab('建議優先度') || '未評估'}`
        };

        if (createdTabId) { await chrome.tabs.remove(createdTabId).catch(() => {}); createdTabId = null; }

        await setRun('匯入 Career Hub 中...');
        // UTF-8 → base64（service worker 環境不用 unescape）
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        const encoded = btoa(bin);
        await sendToTracker(payload, encoded);
        const doneMsg = `${payload.title}｜Match Score ${payload.score}｜建議履歷：${resumeTag || '未指定'}`;
        await setRun('✓ 完成', { ok: true, message: doneMsg });
        notify('✓ 已匯入 Career Hub', doneMsg);
        await cleanupRun(runId);
    } catch (e) {
        await handleAnalyzeFailure({ url, tabId, runId, attempt }, e);
    } finally {
        if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => {});
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'analyze') analyze(msg);
    if (msg?.type === 'profileSync') {
        // content-sync.js 轉送來的 Profile 快照：存起來，下次 analyze() 分析時當候選人背景用。
        // 每次打開 Career Hub 網站、Profile 有變動時都會重新推送一次，所以這份快取只會跟
        // 「上次打開 Career Hub 網站」一樣新，不是即時同步。
        chrome.storage.local.set({ profileSnapshot: { profile: msg.profile, syncedAt: Date.now() } });
    }
});
