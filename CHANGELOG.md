# 版本紀錄

## 尚未合併（PR 審核中）

- **[#10](https://github.com/ypc0701-cmyk/Job-searching-tracker/pull/10) 新增 Google 登入**：資料改成跟著帳號走，不是跟著瀏覽器走。匿名帳號第一次登入會原地升級（職缺資料不動）；同一個 Google 帳號在別的裝置登入過，會自動把這個瀏覽器的職缺搬過去且不重複。順便修掉一個潛在 bug：原本每次開頁面都無條件建立匿名帳號，有機率在 Firebase 還原已登入狀態前搶跑，蓋掉既有的 Google 身分。
- **[#9](https://github.com/ypc0701-cmyk/Job-searching-tracker/pull/9) Extension 不再每次分析都開新分頁**：Career Hub 已開著就直接匯入那一頁（不重新載入、不切分頁、不打斷你正在編輯的表單）；沒開才開新的。背景分頁裡 `confirm()`/`alert()` 會被瀏覽器擋住或卡住，重複網址的提示和匯入失敗訊息改成不會卡住的 toast。

## 2026-09-24 — 履歷自動同步、Handshake 獨立爬蟲

- **履歷替換後自動同步**：新增 `scripts/sync_resumes.py`，履歷 `.docx` 更新後自動重新產生兩份 `resume-library.json`（網站、extension 各一份），不用再手動操作三個步驟。
- **新增 Handshake 單一網址爬蟲**（`scrapers/`，Playwright）：給一個 Handshake 職缺網址，擷取職稱、公司、完整 JD，規則跟 Chrome extension 一致。Handshake 的 Cloudflare 防護會擋掉 headless 瀏覽器，所以預設有頭模式，登入由使用者手動完成一次並保存在專用 profile，程式碼內不存任何帳密。
- 三份履歷檔案改名為 `Pin-Chu Yin_<版本>.docx`（投遞用檔名），同步腳本取檔名最後一個底線後的部分當版本名稱，不影響既有的 `resume-library.json` key。

## 2026-09-11 ～ 09-14 — 擷取規則修正、評分邏輯重新設計

- **全面移除「掃描整頁猜測 JD」的退路**：LinkedIn、Handshake、Indeed 全部改成只用穩定錨點（`data-testid`、固定 ID、精確文字定位）擷取，找不到就直接回報失敗，不再退而求其次亂掃頁面。
- **新增 Indeed 擷取支援**：`#jobDescriptionText` 這個存在多年的穩定 ID 為主要規則，標題／公司改用 `data-testid` 定位。
- 用真實職缺頁面實測修正多個規則 bug：
  - CSS 選擇器清單（如 `'main h1, h1'`）是照文件順序合併結果，不是「優先用前者」，導致 Handshake 頁面抓到錯誤的頁面級標題
  - Handshake 雇主連結同一規則會命中好幾個連結，第一個常是空文字的 logo 連結，改成找「第一個有文字內容」的
  - Handshake 收合內容展開按鈕的文字其實是純「More」，原本的比對規則只吃「See More」一類的寫法，從未真正展開過
- **評分邏輯重新設計**：從「整體背景適配度」改成「這份履歷投遞後，通過 ATS 關鍵字篩選 + 招募人員初步篩選的機率」，要求 Gemini 先逐項檢查必要條件、核心職責覆蓋、關鍵字命中／缺漏，再依明確定義的級距（9-10 到 0-2）打分，而不是自由心證。
- Gemini 回覆格式不符預期時，不再默默當成「成功」存入分數 0 的垃圾資料，改成失敗並顯示原始回覆內容，方便判斷問題出在哪。

## 2026-08-13 — 推薦履歷功能、Indeed 初版

- 內建 AI 分析（網站）與 Chrome extension 兩邊，新增「依六份履歷版本比對 JD、推薦最適合的一份」功能，附推薦理由。
- 履歷內容更新同步進 `resume-library.json`。

## 2026-07-20 — Chrome Extension 一鍵匯入

- 新增 Chrome extension：在 LinkedIn／Handshake 職缺頁一鍵抓取 JD、AI 分析並匯入 Job Tracker。
- 履歷標籤（建議履歷版本）、Easy Apply 標記、客製化文件附件、Apply 按鈕（開啟職缺頁並詢問是否標記已投遞）。
- Gemini 過載時自動重試，仍失敗則改用備用模型（`gemini-2.5-flash` → `gemini-2.5-flash-lite`）。
- Extension 重構為背景服務架構，執行狀態存進 storage 讓 popup 重新打開時仍看得到進度與結果，不再只靠容易被系統擋掉的通知。
- LinkedIn 擷取規則改成內容比對式（讀取履歷全文比對 JD），不依賴動態 class。

## 2026-07-02 — 修好 Gemini 分析功能

- 修正內建 AI 分析：Gemini API key 原本是空字串、呼叫的模型已下架、API 回應錯誤被靜默吞掉只顯示「分析失敗」。
- Firebase 設定改成有預設值，不用每次手動貼 config。

## 更早期

- 2026-05-15 及以前：專案初始版本（Firebase 串接、基本職缺列表與表單），由 AI Studio 產生。這之後的所有功能都建立在這個基礎上並大幅改寫。
