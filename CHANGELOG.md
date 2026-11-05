# 版本紀錄

## 2026-11-05 — Handshake／LinkedIn 擷取規則擴充、AI 評分改成公式化

- **Handshake 新增「At a glance」區塊解析**：薪資、工作地點（州／市／On-site·Remote·Hybrid）、職缺類型（Full-time/Part-time/Internship 等）、工作許可要求，直接讀取 Handshake 頁面上自己標好的結構化資訊，比讓 AI 從 JD 全文猜測準確；工作許可文字會附加進職缺備註。公司名稱擷取新增第三層備援（取職稱 `h1` 正上方那一行純文字），涵蓋部分版型沒有雇主連結、也沒有 `data-hook` 屬性的情況。
- **LinkedIn 擷取新增備援規則**：`document.title` 格式跑掉時，改用頁面上穩定的網址樣式抓職稱／公司（公司連到 `/company/<slug>/`、職稱連到目前分頁網址對應的 `/jobs/view/<職缺ID>`，避免抓到側邊欄其他職缺的標題連結）。
- **AI 評分邏輯改成公式化三分量**：原本「整體印象、分五級打分」改成明確公式——職責符合度（5 分，逐項 1/0.5/0）＋必填工具符合度（3 分，只算 JD 標「必要」的工具，加分項另列不計分）＋方向契合度（2 分，Product Management/Analyst=2、BI/Data=1.5、Marketing=1、其他分析/營運=0.5、不相關=0），加總四捨五入到小數一位。新增：忽略年資要求、美國地點與簽證贊助語言不扣分（候選人持 OPT 工作）、固定黑名單防止捏造特定業績數字/ROAS/定價測試等說法、風險旗標（在校生限定、工程學位、安全許可、到職日風險、簽證贊助語言、現場或出差、核心必要條件完全沒有）、達標建議（分數 ≥ 6 才建議投入客製化履歷製作）。候選人背景與履歷比對維持讀取即時 Profile／目前的履歷清單，不寫死成固定事實檔案，履歷新增、刪除或 Profile 更新都會自動反映。

## 2026-11-04 — Overview 時間篩選重做、AI 分析規則修正、履歷產生功能

- **Overview 預設只看 Applied、不能翻到未來**：長條圖／熱力圖預設只統計 Applied 狀態筆數，點哪張狀態卡片就切換成統計那個狀態；Week/Month 導覽的「下一週/下一月」到達本週/本月後停用。
- **狀態標籤跟著 Overview 選到的區間走**：原本固定顯示全部資料筆數，改成隨 Overview 目前選中的日期／週／月／年一起變動。
- **Network 聯絡人表單拿掉「關聯職缺」下拉選單**，改成只能從職缺那邊連結到聯絡人（單向）。
- **職缺列表新增聯絡人捷徑**：職缺連結了 Network 聯絡人會顯示小圖示，點擊彈出該聯絡人的唯讀資訊（含可點擊的 LinkedIn 連結）與「Edit in Network」按鈕。
- **Network 頁新增搜尋欄**。
- **新增 Generate Resume 按鈕**：Add/Edit Job 視窗裡，貼上或存檔過的 JD 可以一鍵生成客製化履歷（比對 Profile 與 JD），結果可下載 PDF 或 Word（.doc）。
- **修正 AI 類別誤判 bug**：候選人背景原本寫死「MSBA 學生」，導致 Gemini 只要看到候選人是學生就偏向判斷成 Intern，即使 JD 完全沒提到實習字樣；改成讀取真實 Profile 內容當背景，並明確禁止「因為候選人是學生就預設 Intern」。
- **介面細節調整**：職缺列表圖示（Network／連結）搬到狀態標籤前面；LinkedIn Profile／Edit in Network 連結拿掉箭頭，字體大小與顏色統一成灰色小字；Network 聯絡人圖示改成跟頂部導覽列一致的深灰色。
- **Overview 新增 Year 與 Custom 兩個時間維度，外加 All**：7 張狀態卡片改成跟著目前選中的 Week/Month/Year 區間變動數字（不再永遠顯示全部資料）；Custom 區間沒設起訖日就是 All；Year 最初是依狀態分的長條圖，後改成每月一根 bar 的月份長條圖（當月特別標色，點一根 bar 可直接跳進那個月份的 Month 視圖）。
- **Job Description 永久保存**：Add/Edit Job 視窗新增常駐的 Job Description 欄位，貼過的 JD 存檔後不會消失；Generate Resume 改成優先讀這個存檔欄位，新舊職缺都能用。
- **State 欄位改成下拉選單**（51 州＋華盛頓特區，City 維持自由輸入）；舊資料裡不是標準州名的值，編輯時不會被下拉選單悄悄清空。
- **投遞日期時區修正**：狀態變成 Applied 時自動帶入的日期改用裝置本地時間，不再因為 UTC 轉換差一天。

## 2026-11-04 — 介面大改版：LinkedIn 風格導覽、登入方式、Overview／Network 頁面

- 頂部導覽列改成 LinkedIn 風格的精簡列（真實圖示取代 emoji），介面全面英文化，狀態值從中文字串改成英文代碼（新增 Declined Offer 狀態），舊資料讀取時自動轉換格式維持相容。
- Profile 的每一筆經歷改用獨立彈出視窗編輯，不再是頁面下方的內嵌表單；My Resumes 改成列表→詳細頁兩層結構，有自己的 Edit/Save 流程。
- 新增 Email／密碼註冊與登入，沿用既有「匿名帳號升級成 Google 帳號」的遷移邏輯，套用到 Email 帳號升級與登入既有帳號。
- 職缺列表新增狀態快速篩選標籤、排序／工作型態篩選面板、每頁 25 筆分頁。
- 新增 Overview 頁面：狀態統計卡片、Week（逐日長條圖）與 Month（可設定一週起始日的熱力圖日曆）兩種視圖，可翻到任何過去/未來區間，底部共用可搜尋/篩選的職缺清單。
- 新增 Network 頁面，追蹤招募人員/聯絡人的往來紀錄，職缺可選擇性連結到一筆 Network 聯絡人。
- Job Analysis AI 面板移進 Add Job 流程裡面；新增州／城市／投遞管道／面試階段／下次面試日期／投遞日期等欄位，狀態變成 Applied 時自動帶入投遞日期。

## 2026-10-05 — iOS Shortcut 一鍵帶 JD 分析

- 新增 `#jdtext=` 網址參數：iOS Shortcut 在 Safari 抓到 JD 文字後可以直接帶進 Career Hub 觸發分析，共用現有的貼上分析流程（同一個 AI 面板、同一個 `analyzeJDNative()`），不用另外重寫一套 Gemini 呼叫邏輯。相容標準與 URL-safe 兩種 base64 編碼，解析失敗會以 toast 顯示錯誤而不是把錯誤內容送進 Gemini 當 JD。

## 2026-10-02 — Google 登入、Extension 匯入優化

- **新增 Google 登入**：資料改成跟著帳號走，不是跟著瀏覽器走。匿名帳號第一次登入會原地升級（職缺資料不動）；同一個 Google 帳號在別的裝置登入過，會自動把這個瀏覽器的職缺搬過去且不重複。順便修掉一個潛在 bug：原本每次開頁面都無條件建立匿名帳號，有機率在 Firebase 還原已登入狀態前搶跑，蓋掉既有的 Google 身分。
- **Extension 不再每次分析都開新分頁**：Career Hub 已開著就直接匯入那一頁（不重新載入、不切分頁、不打斷你正在編輯的表單）；沒開才開新的。背景分頁裡 `confirm()`/`alert()` 會被瀏覽器擋住或卡住，重複網址的提示和匯入失敗訊息改成不會卡住的 toast。

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
