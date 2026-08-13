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

// 顯示最近一次執行狀態（popup 關閉重開也看得到），並在 popup 開啟期間即時更新
function renderRun(run) {
    if (!run) return;
    const ago = Math.round((Date.now() - run.time) / 1000);
    const when = ago < 90 ? `${ago} 秒前` : `${Math.round(ago / 60)} 分鐘前`;
    if (run.ok === true) setStatus(`✓ 完成（${when}）\n${run.message}`);
    else if (run.ok === false) setStatus(`✗ 失敗（${when}）\n${run.message}`, true);
    else setStatus(`⏳ ${run.stage}（${when}）`);
}
chrome.storage.local.get('lastRun', ({ lastRun }) => renderRun(lastRun));
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastRun) renderRun(changes.lastRun.newValue);
});

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
