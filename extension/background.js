const TRACKER_URL = "https://ypc0701-cmyk.github.io/Job-searching-tracker/";
const RESUME_TAGS = ["Business Intelligence", "Communication", "Data Analytics", "Marketing Analytics", "Product Manager", "Supply Chain"];
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const isOverloaded = (status, msg) => status === 503 || status === 429 || /high demand|overloaded/i.test(msg || "");

function notify(title, message) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message: message.slice(0, 300) });
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
    const desc = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content');
    if (desc) desc.scrollIntoView({ block: 'center' });
    [...document.querySelectorAll('button')]
        .filter(b => /see more|show more|顯示更多|\.{3}\s*more|…\s*more/i.test(b.innerText))
        .forEach(b => b.click());
}

// 在職缺頁面上執行：抓取標題、公司、JD 全文、Easy Apply 與否
// LinkedIn 已改用隨機雜湊 class 名稱：職稱/公司從 document.title 解析（格式固定），
// JD 用「包含 About the job 的最內層文字區塊」啟發式定位。
function extractJobInfo() {
    const isLinkedIn = location.hostname.includes('linkedin.com');
    let title = "", company = "", jd = "", easyApply = false, closed = false;

    if (isLinkedIn) {
        const parts = document.title.replace(/^\(\d+\)\s*/, '').split('|').map(s => s.trim());
        if (parts.length >= 3) { title = parts[0]; company = parts[1]; }
        closed = /no longer accepting applications/i.test(document.body.innerText);
        easyApply = [...document.querySelectorAll('button')].some(b => /easy apply|快速應徵/i.test(b.innerText));
        jd = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content')?.innerText?.trim() || "";
        if (!jd || jd.length < 100) {
            const blocks = [...document.querySelectorAll('div,section,article')]
                .filter(el => (el.innerText || '').length > 300 && /about the job/i.test(el.innerText))
                .sort((a, b) => a.innerText.length - b.innerText.length);
            if (blocks.length) {
                const text = blocks[0].innerText;
                const start = text.search(/about the job/i);
                jd = text.slice(start >= 0 ? start : 0);
            }
        }
    } else {
        title = document.querySelector('h1')?.innerText?.trim() || document.title;
        company = document.querySelector('[class*="company" i] a, [class*="employer" i]')?.innerText?.trim() || "";
        const body = document.body.innerText;
        const start = body.search(/about the job|job description|responsibilities|職缺描述/i);
        jd = start >= 0 ? body.slice(start, start + 8000) : body.slice(0, 8000);
    }

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
        try {
            await chrome.scripting.executeScript({ target: { tabId }, func: expandJD });
            const [{ result: job }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractJobInfo });
            if (job?.jd && job.jd.length >= 100) return job;
        } catch (e) {
            if (/cannot access|host permission/i.test(e.message)) {
                throw new Error('沒有這個網站的存取權限（僅支援 LinkedIn 與 Handshake）');
            }
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return null;
}

async function analyze({ url, tabId }) {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) { notify('Career Hub', '請先在擴充功能視窗儲存 Gemini API Key'); return; }

    let createdTabId = null;
    try {
        let targetTabId = tabId;
        if (url) {
            // 開啟「可見」分頁：LinkedIn 對背景分頁會延遲渲染，內容永遠載不出來
            const newTab = await chrome.tabs.create({ url, active: true });
            createdTabId = newTab.id;
            targetTabId = newTab.id;
            await waitForTabComplete(targetTabId);
        }

        const job = await extractWithRetry(targetTabId);
        if (!job) throw new Error('抓不到 JD 內容。請確認網址是職缺頁面且仍開放中（已關閉的職缺不會顯示描述）');

        const resumeLib = await fetch(chrome.runtime.getURL('resume-library.json')).then(r => r.json());
        const resumeSection = Object.entries(resumeLib)
            .map(([tag, text]) => `═══ 履歷版本「${tag}」═══\n${text.slice(0, 2600)}`)
            .join('\n\n');

        const systemPrompt = `妳是 Chloe 的職業顧問。請根據 JD 進行適配度分析，並從她的六份履歷版本中推薦最適合這個職缺的一份。
候選人背景：MSBA 學生（Boston University，2027/1 畢業）。

以下是 Chloe 六份履歷版本的完整內容，請實際比對各版本的經歷描述與 JD 要求的重疊程度來推薦，不要只看版本名稱：

${resumeSection}

請嚴格遵守以下格式輸出，不要加任何其他文字：
分數: [0-10]
職稱: [名稱]
公司: [名稱]
類別: [Intern/Full-time]
工作型態: [On-site/Remote/Hybrid]
薪資: [範圍，未提供則寫 未提供]
建議履歷: [${RESUME_TAGS.join('、')} 其中之一]
履歷理由: [一句話說明為何這份履歷的哪些具體經歷最貼合 JD]
理由: [兩句話總結適配點]
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

        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        await chrome.tabs.create({ url: `${TRACKER_URL}#import=${encoded}` });
        notify('✓ 已匯入 Career Hub', `${payload.title}｜分數 ${payload.score}｜建議履歷：${resumeTag || '未指定'}`);
    } catch (e) {
        notify('匯入失敗', e.message);
    } finally {
        if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => {});
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'analyze') analyze(msg);
});
