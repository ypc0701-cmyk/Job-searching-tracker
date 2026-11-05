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

// 跟 background.js 的 STALE_AFTER_SEC 保持一致（兩份各自維護，extension
// 沒有模組系統沒辦法共用常數）：單次執行最糟但正常的情況下（抓取重試＋
// 開分頁等待＋Gemini 逾時重試）跑完全程可能耗時到 ~220 秒，抓寬一點用
// 240 秒。超過這個時間還停在「進行中」，背景現在會自動偵測並重試，這裡
// 的「可能已卡住」只是沒開著 popup 盯著時，重新打開能看到的輔助提示。
const STALE_AFTER_SEC = 240;

// 顯示最近一次執行狀態（popup 關閉重開也看得到），並在 popup 開啟期間即時更新
let lastRunCache = null;
function renderRun(run) {
    if (!run) return;
    lastRunCache = run;
    const ago = Math.round((Date.now() - run.time) / 1000);
    const when = ago < 90 ? `${ago} 秒前` : `${Math.round(ago / 60)} 分鐘前`;
    if (run.ok === true) setStatus(`✓ 完成（${when}）\n${run.message}`);
    else if (run.ok === false) setStatus(`✗ 失敗（${when}）\n${run.message}`, true);
    else if (ago > STALE_AFTER_SEC) setStatus(`⚠️ 可能已卡住（停在「${run.stage}」已 ${when}）\n背景應該已自動偵測並重試；如果一直停在這裡，建議重新執行一次`, true);
    else setStatus(`⏳ ${run.stage}（${when}）`);
}
chrome.storage.local.get('lastRun', ({ lastRun }) => renderRun(lastRun));
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastRun) renderRun(changes.lastRun.newValue);
});
// popup 開著不動时，讓「進行中」狀態的經過時間與是否已卡住的判斷持續更新
setInterval(() => { if (lastRunCache && lastRunCache.ok === undefined) renderRun(lastRunCache); }, 10000);

document.getElementById('save-key').addEventListener('click', () => {
    const key = document.getElementById('gemini-key').value.trim();
    if (!key) return;
    chrome.storage.local.set({ geminiKey: key }, () => {
        keySection.classList.add('hidden');
        setStatus('Key 已儲存 ✓');
    });
});

btn.addEventListener('click', async () => {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) {
        keySection.classList.remove('hidden');
        setStatus('請先儲存 Gemini API Key', true);
        return;
    }

    const inputUrl = document.getElementById('job-url').value.trim();
    if (inputUrl && !/^https:\/\/([\w-]+\.)*(linkedin\.com|joinhandshake\.com|indeed\.com)\//.test(inputUrl)) {
        setStatus('網址輸入目前僅支援 LinkedIn 與 Handshake 的職缺頁面', true);
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // 交給背景服務處理：貼網址會開啟可見分頁載入職缺（LinkedIn 對背景分頁
    // 會延遲渲染，內容載不出來），完成後自動關閉並開啟 Career Hub 匯入分頁。
    chrome.runtime.sendMessage({ type: 'analyze', url: inputUrl || null, tabId: tab.id });
    setStatus('已開始處理 ✓\n' + (inputUrl
        ? '將開啟職缺分頁進行抓取（完成後自動關閉），分析完成會自動開啟 Career Hub。此視窗可關閉。'
        : '正在抓取目前分頁的職缺內容，分析完成會自動開啟 Career Hub。此視窗可關閉。'));
});
