# Job-searching-tracker

## Handshake JD 爬蟲

### 建議方式：使用 Chrome Extension

Handshake／學校 SSO 若阻擋 Playwright 登入，請直接在平常已登入的 Chrome 開啟 Handshake 職缺，再使用 `extension/` 內的 Career Hub 擴充功能。擴充功能會在既有登入分頁中執行，不接觸帳密，也不需要另外建立爬蟲登入狀態。

載入方式：

1. Chrome 開啟 `chrome://extensions/`。
2. 開啟「開發人員模式」。
3. 選擇「載入未封裝項目」，指定本專案的 `extension/` 資料夾。
4. 在已登入的 Handshake 職缺頁按擴充功能的分析按鈕。

Handshake 分支只擷取 `Job description` 標題後的相鄰內容節點，不掃描整頁；LinkedIn 原有邏輯不變。

### 備用方式：獨立 Playwright profile

安裝 Playwright（登入使用電腦已安裝的正式 Google Chrome）：

```bash
npm install
```

擷取單一 Handshake 職缺（只擷取 `Job description` 內容區，不掃整頁）：

```bash
npm run scrape:handshake -- --url "https://app.joinhandshake.com/stu/jobs/123" --output data/handshake-123.json
```

第一次使用先開啟正式 Google Chrome，手動完成 Handshake／學校 SSO 登入。登入 session 會保存在被 Git 忽略的專用 profile `.auth/handshake-profile/`，不會讀取平常使用的 Chrome profile：

```bash
npm run auth:handshake
```

之後直接擷取；爬蟲預設重用同一個專用 profile：

```bash
npm run scrape:handshake -- --url "https://app.joinhandshake.com/stu/jobs/123" --output data/handshake-123.json
```

如需使用另一個專用 profile，可在登入及擷取時指定相同路徑：

```bash
npm run auth:handshake -- .auth/handshake-secondary
npm run scrape:handshake -- --url "https://app.joinhandshake.com/stu/jobs/123" --profile .auth/handshake-secondary
```

關鍵字、履歷版本及入庫門檻請見 [`docs/job-keywords.md`](docs/job-keywords.md)。
