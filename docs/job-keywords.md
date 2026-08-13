# 職缺關鍵字與 JD 對照規則

此檔案是後續每日搜尋工作的唯一關鍵字來源。搜尋結果取得完整 JD 後，再與對應履歷比對；適配分數必須 **大於 6 分** 才可寫入資料庫。

## 關鍵字資料庫

搜尋時每個關鍵字獨立查詢；相同 URL 只保留一筆。搜尋不區分大小寫，`Intern`、`Internship`、`Entry Level` 和 `Associate` 可作為職涯階段變體。

| 關鍵字群組 | 搜尋關鍵字 | 對照履歷 key | 履歷狀態 |
|---|---|---|---|
| Business Intelligence | Business Intelligence | Business Intelligence | 已存在 |
| Business Intelligence | Business Intelligence Analyst | Business Intelligence | 已存在 |
| Business Intelligence | BI Analyst | Business Intelligence | 已存在 |
| Business Intelligence | BI Developer | Business Intelligence | 已存在 |
| Business Intelligence | Reporting Analyst | Business Intelligence | 已存在 |
| Business Intelligence | Dashboard Analyst | Business Intelligence | 已存在 |
| Business Intelligence | Data Visualization Analyst | Business Intelligence | 已存在 |
| Business Intelligence | Insights Analyst | Business Intelligence | 已存在 |
| Business Intelligence | Analytics and Reporting Analyst | Business Intelligence | 已存在 |
| Business Analysis | Business Analysis | Business Analysis | **待建立** |
| Business Analysis | Business Analyst | Business Analysis | **待建立** |
| Business Analysis | Business Systems Analyst | Business Analysis | **待建立** |
| Business Analysis | Business Process Analyst | Business Analysis | **待建立** |
| Business Analysis | Requirements Analyst | Business Analysis | **待建立** |
| Business Analysis | Functional Analyst | Business Analysis | **待建立** |
| Business Analysis | Operations Analyst | Business Analysis | **待建立** |
| Business Analysis | Strategy Analyst | Business Analysis | **待建立** |
| Business Analysis | Management Analyst | Business Analysis | **待建立** |
| Product Management | Product Management | Product Management | 已存在 |
| Product Management | Product Management Intern | Product Management | 已存在 |
| Product Management | Product Manager | Product Management | 已存在 |
| Product Management | Associate Product Manager | Product Management | 已存在 |
| Product Management | Junior Product Manager | Product Management | 已存在 |
| Product Management | Product Analyst | Product Management | 已存在 |
| Product Management | Product Operations Analyst | Product Management | 已存在 |
| Product Management | Product Operations | Product Management | 已存在 |
| Product Management | Technical Product Manager | Product Management | 已存在 |
| Product Management | Growth Product Manager | Product Management | 已存在 |
| Product Management | Product Owner | Product Management | 已存在 |

## JD 延伸關鍵字群組

這一層用來判斷 JD 與履歷群組是否相關，不一定直接拿來搜尋職缺。以下為初始詞庫；自動更新程序會依後述規則擴充。

| 關鍵字群組 | JD 延伸關鍵字 |
|---|---|
| Business Intelligence | business intelligence、BI、dashboard、reporting、data visualization、SQL、KPI、insights、analytics |
| Business Analysis | requirements、stakeholder、business process、process improvement、workflow、use case、functional specification、gap analysis |
| Product Management | product strategy、roadmap、product lifecycle、user research、customer needs、prioritization、experimentation、go-to-market、cross-functional |

此表只放人工確認或由實際 JD 統計達標後產生的詞。規則中的 `strategy` 僅為計算示例，不代表它已被加入任何群組。

## 關鍵字自動更新規則

### 1. 資料分組

- 每份 JD 依「當初搜尋命中的關鍵字群組」歸類。
- 同一職缺即使命中多個搜尋詞，也只計算一次；以正規化後的職缺 URL 去重。
- 已關閉、內容少於 100 字或擷取失敗的 JD 不納入統計。
- 每個群組至少累積 10 份有效 JD 才執行更新；不足 10 份時只累積資料。

### 2. 文字正規化

- 全部轉成小寫，移除 HTML、標點、網址、電子郵件及多餘空白。
- 單複數及常見詞形視為同一詞，例如 `strategies` → `strategy`、`analyses` → `analysis`。
- 同時計算單詞、雙詞及三詞片語；優先保留片語，例如 `product strategy` 優先於 `strategy`。
- 排除英文停用詞，以及 `job`、`role`、`company`、`candidate`、`team`、`work`、`experience`、`skills` 等低辨識度 JD 通用詞。

### 3. 重複率

重複率以「出現該詞的 JD 數量」計算，而不是同一份 JD 內的出現次數：

```text
群組重複率 = 包含該關鍵字的群組 JD 數 ÷ 該群組有效 JD 總數
```

例如 20 份 Business Intelligence JD 中有 14 份出現 `strategy`：

```text
strategy 的群組重複率 = 14 ÷ 20 = 70%
```

同一份 JD 即使出現 `strategy` 10 次，仍只計為一份，避免單一公司文案扭曲結果。

### 4. 群組辨識力

除了群組內重複率，也要檢查該詞是否在其他群組同樣常見：

```text
跨群組重複率 = 包含該關鍵字的其他群組 JD 數 ÷ 其他群組有效 JD 總數
辨識分數 = 群組重複率 - 跨群組重複率
```

這可避免將 `communication`、`team` 或 `Microsoft Office` 等所有職位都常見的詞錯誤加入單一群組。

### 5. 自動加入門檻

符合以下全部條件時，自動加入該群組的「JD 延伸關鍵字」：

- 至少出現在 5 份該群組 JD。
- 群組重複率至少 60%。
- 辨識分數至少 20 個百分點。
- 不在停用詞或排除詞清單。
- 尚未存在於該群組，且不是現有詞的大小寫、單複數或詞形變體。

若群組重複率達 60%，但辨識分數不足 20 個百分點，標記為「通用輔助詞」；可以參與語意評分，但不能單獨觸發群組分類。

### 6. 升級成職位搜尋關鍵字

JD 延伸詞只有在符合以下條件時，才加入上方「關鍵字資料庫」並成為新的 Handshake／Indeed 搜尋查詢：

- 它是明確職稱或職稱片語，例如 `Reporting Analyst`，而非 `strategy`。
- 至少在 3 個不同公司的職缺標題中出現。
- 至少 80% 的標題樣本經既有 JD 規則判定屬於同一群組。
- 不包含資深職位排除詞。

像 `strategy`、`SQL`、`dashboard` 只能留在 JD 延伸關鍵字；`Strategy Analyst`、`BI Developer` 才可成為職位搜尋關鍵字。

### 7. 更新與稽核紀錄

每次更新需保存以下欄位，讓錯誤擴張可以追蹤及回復：

```text
keyword
keyword_group
keyword_type        # jd_signal 或 job_title
group_document_count
matched_document_count
group_frequency
cross_group_frequency
distinctiveness_score
sample_job_urls
added_at
status              # active、generic、rejected
```

- 每日爬取完成後重新統計一次，但同一關鍵字 7 天內最多更新一次。
- 新增詞保留最多 5 個來源職缺 URL 作為證據。
- 連續 30 天重複率低於 30% 的自動詞降為 `rejected`，不直接刪除歷史紀錄。
- 人工建立的初始關鍵字不得被自動程序刪除。

### 職涯階段展開

對上表中沒有明確階段字樣的關鍵字，搜尋器可依序建立以下查詢：

```text
<keyword> Intern
<keyword> Internship
Entry Level <keyword>
Associate <keyword>
```

若原關鍵字已含 `Intern`、`Internship`、`Entry Level`、`Associate` 或 `Junior`，不得再次附加階段字樣。

### 排除規則

- 職稱包含 `Senior`、`Sr.`、`Lead`、`Principal`、`Staff`、`Manager II`、`Director`、`Head` 或 `VP` 時排除。
- `Product Marketing Manager` 不歸入 Product Management；它偏向行銷職能。
- `Project Manager`、`Program Manager` 不自動歸入 Product Management；只有 JD 明確包含 product strategy、roadmap 或 product lifecycle 時才進一步評分。
- `Data Analyst` 不自動歸入 Business Intelligence；只有 JD 明確包含 dashboard、reporting、BI 或 data visualization 時才使用 Business Intelligence 履歷。
- 對照履歷狀態為「待建立」的關鍵字先允許搜尋與擷取，但在履歷完成前不得送入自動評分或資料庫。

## JD 擷取規則

通用原則：不可將整個 `document.body` 傳給模型，也不可依賴 `sc-*`、`_xxxxxxxx`（CSS Modules 雜湊）這類動態 class——每次改版就換。優先順序：語意化屬性（`data-testid`、`role`）> 穩定 ID > 文字內容錨點。**不做全頁掃描退路**——以上錨點都找不到就視為擷取失敗，交由呼叫端重試或回報錯誤，絕不掃描整個頁面猜測哪一塊是 JD。

### Handshake

不可依賴 `sc-*` 這類動態 class。

1. 找到文字完全等於 `Job description`（忽略大小寫）的 heading。
2. 往上取得 heading 的直接父層 `div`。
3. 取得該父層第一個相鄰的 `div`。
4. 只讀取該內容節點的 `innerText`。
5. JD 少於 100 字時視為尚未載入或擷取失敗，不送進模型。

Playwright locator：

```js
const heading = page.getByRole('heading', { name: /^job description$/i }).first();
const jd = await heading
  .locator('xpath=parent::div/following-sibling::div[1]')
  .innerText();
```

等價 XPath：

```xpath
//h3[normalize-space(.)='Job description']/parent::div/following-sibling::div[1]
```

### LinkedIn

LinkedIn 職缺頁的 class 全部是 CSS Modules 隨機雜湊（如 `_8707df48`），完全不可用。穩定錨點是 JD 內容容器上的 `data-testid="expandable-text-box"`——這是 LinkedIn 內部 QA 自動化用的屬性，比雜湊 class 穩定。

1. 定位 `[data-testid="expandable-text-box"]`，只讀取該節點的 `innerText`。
2. 備援：找不到時退回舊版 DOM 選擇器 `#job-details, .jobs-description__content, .jobs-box__html-content`（部分版型可能還沒切換到新 data-testid），一樣是精準選擇器，不是全頁掃描。
3. 兩者都失敗就是擷取失敗，不做全頁掃描。
4. 職稱／公司改從 `document.title` 解析（格式固定為「職稱 | 公司 | LinkedIn」），不依賴頁面 class。
5. JD 少於 100 字時視為尚未載入或擷取失敗，不送進模型；擷取前先點擊「…more／see more」按鈕展開摺疊內容。

Playwright locator：

```js
const jdContainer = page.locator('[data-testid="expandable-text-box"]').first();
await jdContainer.waitFor({ state: 'visible', timeout: 15000 });
const jd = (await jdContainer.innerText()).trim();
```

實作位置：[extension/background.js](../extension/background.js) 的 `extractJobInfo()`。

### Indeed

`/viewjob?jk=...` 職缺頁有多年未變的穩定 ID／`data-testid`，一律優先使用；`sc-*`（Rosetta 設計系統）雜湊 class 不可用。

1. JD：`#jobDescriptionText`（穩定 ID，優先）。
2. JD 備援：找不到 ID 時（例如搜尋結果側欄版型），改用標題錨點——h\*(文字**結尾**符合「job description」，忽略大小寫) → 父層 → 下一個相鄰 `div`。**用「結尾比對」而非精準相等**：實測發現 Indeed 至少有兩種版型，標題文字分別是 `Job description` 和 `Full job description`，結尾比對可以兩者都吃到。
3. 兩者都失敗就是擷取失敗，不做全頁掃描。
4. 職稱：`[data-testid="jobsearch-JobInfoHeader-title"]`；找不到才退回 `document.title` 解析（格式為「職稱 - 地點 - Indeed.com」，**不含公司名**，只能取職稱那一段）。
5. 公司：`[data-testid="inlineHeader-companyName"]`。
6. JD 少於 100 字時視為尚未載入或擷取失敗，不送進模型。

Playwright locator：

```js
let jd = await page.locator('#jobDescriptionText').innerText().catch(() => '');
if (jd.length < 100) {
  const heading = page.getByRole('heading', { name: /job description$/i }).first();
  jd = await heading.locator('xpath=parent::div/following-sibling::div[1]').innerText();
}
const title = await page.locator('[data-testid="jobsearch-JobInfoHeader-title"]').innerText();
const company = await page.locator('[data-testid="inlineHeader-companyName"]').innerText();
```

實作位置：同上，`extractJobInfo()` 的 `isIndeed` 分支。

## 評分與入庫規則（下一階段）

- 比對輸入：精準擷取的 JD、該列「指定履歷」的完整文字。
- 分數範圍：0–10。
- 入庫條件：JD 與過往經歷相似即入庫，不以履歷分數作為排除門檻。
- JD 與過往經歷相似、但指定履歷適配度低於 6 分：照常入庫，保留原始低於 6 分的分數。
- JD 與過往經歷相似、且指定履歷適配度大於等於 6 分：照常入庫，保留大於等於 6 分的分數。
- 建議去重鍵：`source + normalized job URL`。
- 排程時區：`Asia/Taipei`，每日 09:00。
- 所有自動新增職缺的狀態固定為「未投遞」，不自動投遞履歷。
