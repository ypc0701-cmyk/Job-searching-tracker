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

btn.addEventListener('click', async () => {
    const { geminiKey } = await chrome.storage.local.get('geminiKey');
    if (!geminiKey) {
        keySection.classList.remove('hidden');
        setStatus('請先儲存 Gemini API Key', true);
        return;
    }

    const inputUrl = document.getElementById('job-url').value.trim();
    if (inputUrl && !/^https:\/\/([\w-]+\.)*(linkedin\.com|joinhandshake\.com)\//.test(inputUrl)) {
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
