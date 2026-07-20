const TRACKER_URL = "https://ypc0701-cmyk.github.io/Job-searching-tracker/";
const RESUME_TAGS = ["Business Intelligence", "Communication", "Data Analytics", "Marketing Analytics", "Product Manager", "Supply Chain"];

const statusEl = document.getElementById('status');
const btn = document.getElementById('analyze-btn');
const keySection = document.getElementById('key-section');

function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.className = isError ? 'error' : '';
}

chrome.storage.local.get('geminiKey', ({ geminiKey }) => {
    if (!geminiKey) keySection.classList.remove('hidden');
});

document.getElementById('save-key').addEventListener('click', () => {
    const key = document.getElementById('gemini-key').value.trim();
    if (!key) return;
    chrome.storage.local.set({ geminiKey: key }, () => {
        keySection.classList.add('hidden');
        setStatus('Key 已儲存 ✓');
    });
});

// 呼叫 Gemini：過載時自動重試一次，仍失敗則改用備用模型
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const isOverloaded = (status, msg) => status === 503 || status === 429 || /high demand|overloaded/i.test(msg || "");

async function callGemini(apiKey, body, onStatus) {
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
            onStatus?.(`${model} 忙碌中，${attempt === 1 ? '2 秒後重試' : '改用備用模型'}...`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw lastErr;
}

// 在職缺頁面上執行：展開收合的 JD（點 See more）並捲動到描述區塊，觸發延遲載入
function expandJD() {
    const desc = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content');
    if (desc) desc.scrollIntoView({ block: 'center' });
    [...document.querySelectorAll('button')]
        .filter(b => /see more|show more|顯示更多|\.{3}\s*more|…\s*more/i.test(b.innerText))
        .forEach(b => b.click());
}

// 等待分頁載入完成
function waitForTabComplete(tabId, timeoutMs = 15000) {
    return new Promise(resolve => {
        const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') { cleanup(); resolve(); }
        };
        const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

// 重試抓取：LinkedIn 內容為延遲載入，最多嘗試 6 次、每次間隔 1.2 秒
async function extractWithRetry(tabId, onStatus) {
    for (let i = 0; i < 6; i++) {
        try {
            await chrome.scripting.executeScript({ target: { tabId }, func: expandJD });
            const [{ result: job }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractJobInfo });
            if (job?.jd && job.jd.length >= 100) return job;
        } catch (e) {
            if (/cannot access|host permission/i.test(e.message)) {
                throw new Error('沒有這個網站的存取權限。網址輸入目前僅支援 LinkedIn 與 Handshake');
            }
        }
        onStatus(`等待職缺內容載入中...（${i + 1}/6）`);
        await new Promise(r => setTimeout(r, 1200));
    }
    return null;
}

// 在職缺頁面上執行：抓取標題、公司、JD 全文、Easy Apply 與否
function extractJobInfo() {
    const isLinkedIn = location.hostname.includes('linkedin.com');
    const title = document.querySelector('h1')?.innerText?.trim() || document.title;
    let company = "";
    let jd = "";
    let easyApply = false;

    if (isLinkedIn) {
        company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name')?.innerText?.trim() || "";
        jd = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content')?.innerText?.trim() || "";
        easyApply = [...document.querySelectorAll('button')].some(b => /easy apply|快速應徵/i.test(b.innerText));
    }

    // 通用 fallback（Handshake 或其他求職網站）：取頁面主要文字
    if (!jd) {
        const body = document.body.innerText;
        const start = body.search(/about the job|job description|description|responsibilities|職缺描述/i);
        jd = start >= 0 ? body.slice(start, start + 8000) : body.slice(0, 8000);
    }
    if (!company) {
        company = document.querySelector('[class*="company" i] a, [class*="employer" i]')?.innerText?.trim() || "";
    }

    return { title, company, jd, easyApply, url: location.href.split('?')[0] };
}

btn.addEventListener('click', async () => {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) {
        keySection.classList.remove('hidden');
        setStatus('請先儲存 Gemini API Key', true);
        return;
    }

    btn.disabled = true;
    let createdTabId = null;
    try {
        const inputUrl = document.getElementById('job-url').value.trim();
        let tabId;
        if (inputUrl) {
            if (!/^https:\/\/([\w-]+\.)*(linkedin\.com|joinhandshake\.com)\//.test(inputUrl)) {
                throw new Error('網址輸入目前僅支援 LinkedIn 與 Handshake 的職缺頁面');
            }
            setStatus('背景開啟職缺頁面中...');
            const newTab = await chrome.tabs.create({ url: inputUrl, active: false });
            createdTabId = newTab.id;
            tabId = newTab.id;
            await waitForTabComplete(tabId);
        } else {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = tab.id;
        }

        setStatus('抓取職缺內容中...');
        const job = await extractWithRetry(tabId, setStatus);
        if (!job) throw new Error('抓不到 JD 內容。請確認這是職缺頁面（貼網址或直接開啟職缺頁），且網路可正常載入');

        setStatus(`已抓取：${job.title}\nGemini 分析中...`);

        const systemPrompt = `妳是 Chloe 的職業顧問。請根據以下 JD 進行適配度分析。
候選人背景：MSBA 學生（Boston University，2027/1 畢業），具備 Meta Ads 廣告投放與 A/B 測試、市場研究、數據分析、供應鏈管理與創業經驗（DTC 電商品牌創辦人，4 個月 NTD $100K 營收）。
請嚴格遵守以下格式輸出，不要加任何其他文字：
分數: [0-10]
職稱: [名稱]
公司: [名稱]
類別: [Intern/Full-time]
工作型態: [On-site/Remote/Hybrid]
薪資: [範圍，未提供則寫 未提供]
建議履歷: [從這些選項中選一個最適合的：${RESUME_TAGS.join('、')}]
理由: [兩句話總結適配點]
建議: [對策]`;

        const aiText = await callGemini(geminiKey, {
            contents: [{ parts: [{ text: `JD內容:\n${job.jd.slice(0, 12000)}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        }, setStatus);
        if (!aiText) throw new Error('Gemini 未回傳分析內容');

        // 解析 Gemini 回覆
        const grab = (label) => {
            const m = aiText.match(new RegExp(`${label}[:：]\\s*(.+)`));
            return m ? m[1].trim() : "";
        };
        const resumeTagRaw = grab('建議履歷');
        const resumeTag = RESUME_TAGS.find(t => resumeTagRaw.includes(t)) || "";

        const payload = {
            title: grab('職稱') || job.title,
            company: grab('公司') || job.company,
            category: grab('類別'),
            type: grab('工作型態'),
            score: parseFloat((grab('分數').match(/[\d.]+/) || [0])[0]) || 0,
            salary: grab('薪資'),
            jobUrl: job.url,
            resumeTag,
            easyApply: job.easyApply,
            notes: `【建議履歷】${resumeTag || resumeTagRaw}\n\n【分析理由】\n${grab('理由')}\n\n【對策建議】\n${grab('建議')}`
        };

        setStatus('匯入 Career Hub 中...');
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        await chrome.tabs.create({ url: `${TRACKER_URL}#import=${encoded}` });
        setStatus(`✓ 已匯入：${payload.title}（分數 ${payload.score}，建議履歷 ${resumeTag || '未指定'}）`);
    } catch (e) {
        setStatus(`錯誤：${e.message}`, true);
    } finally {
        if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => {});
        btn.disabled = false;
    }
});
