// Career Hub 網站 <-> Extension 的橋接：網站（index.html）每次 Profile 有變動，
// 會用 postMessage 把目前的 Profile 丟出來；這支 content script 收到後轉送給
// background.js 存進 chrome.storage，讓 Extension 分析職缺時也能用上真實的 Profile
// 資料（經歷、技能等），不用再靠寫死的候選人背景。
//
// 用 postMessage 而不是 chrome.runtime.sendMessage(extensionId, ...)：網站端不用
// 知道這個 extension 的 ID（unpacked 版本重新載入可能換 ID），只要照一般網頁的方式
// 發訊息就好。
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'CAREER_HUB_PROFILE_SYNC') return;
    chrome.runtime.sendMessage({ type: 'profileSync', profile: event.data.profile }).catch(() => {});
});
