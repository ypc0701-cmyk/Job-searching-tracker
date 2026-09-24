#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const HANDSHAKE_HOST = /(^|\.)joinhandshake\.com$/i;
const DESCRIPTION_HEADING = /^job description$/i;

export function parseArgs(argv) {
  const options = {
    url: '',
    output: '',
    profile: '.auth/handshake-profile',
    // Verified live: Handshake's Cloudflare bot check blocks headless Chromium
    // outright (stuck on the "Performing security verification" page even
    // after a 10s wait), but passes normally in headed mode. Default to
    // headed; HEADLESS=true / --headless exist only for a future fix, not
    // because headless currently works.
    headless: process.env.HEADLESS === 'true'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i] || '';
    else if (arg === '--output') options.output = argv[++i] || '';
    else if (arg === '--profile') options.profile = argv[++i] || '';
    else if (arg === '--headed') options.headless = false;
    else if (arg === '--headless') options.headless = true;
    else if (!arg.startsWith('--') && !options.url) options.url = arg;
    else throw new Error(`不支援的參數：${arg}`);
  }

  if (!options.url) {
    throw new Error('缺少 Handshake 職缺網址。請使用 --url <URL>。');
  }

  const parsedUrl = new URL(options.url);
  if (parsedUrl.protocol !== 'https:' || !HANDSHAKE_HOST.test(parsedUrl.hostname)) {
    throw new Error('只允許 https://*.joinhandshake.com/ 的網址。');
  }

  return options;
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = (await locator.innerText().catch(() => '')).trim();
      if (text) return text;
    }
  }
  return '';
}

export async function extractHandshakeJob(page) {
  const heading = page.getByRole('heading', { name: DESCRIPTION_HEADING }).first();
  await heading.waitFor({ state: 'visible', timeout: 20_000 });

  // HTML anchor rule:
  // h3("Job description") -> parent header div -> first following sibling div.
  // This deliberately excludes the surrounding page and the "Less" button.
  const descriptionContainer = heading.locator(
    'xpath=parent::div/following-sibling::div[1]'
  );
  await descriptionContainer.waitFor({ state: 'visible', timeout: 10_000 });

  // On the job-search list view the description is collapsed behind a "More"
  // button (verified live: 178 chars collapsed -> 5677 chars expanded, same
  // content the employer actually wrote). Scoped to descriptionContainer so
  // this never clicks an unrelated "More"/pagination button elsewhere on the
  // page. Matched by button text, not Handshake's dynamic hashed classes.
  const moreButtons = descriptionContainer.locator('button', { hasText: /^more$/i });
  const moreCount = await moreButtons.count();
  for (let i = 0; i < moreCount; i += 1) {
    await moreButtons.nth(i).click().catch(() => {});
  }
  if (moreCount > 0) {
    await page.waitForTimeout(300);
  }

  const description = (await descriptionContainer.innerText())
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (description.length < 100) {
    throw new Error(`JD 內容過短（${description.length} 字），可能尚未載入完成。`);
  }

  const title = await firstText(page, [
    'main h1',
    'h1',
    '[data-hook="job-title"]'
  ]);
  // Company: Handshake employer profile links are always /e/<id> — a stable
  // URL pattern, unlike the class names. [data-hook="employer-name"] tried
  // first in case a page variant still has it; verified live that the
  // current list view does not, and /e/<id> under the title's container is
  // what actually resolves to the employer name.
  let company = await firstText(page, ['[data-hook="employer-name"]']);
  if (!company) {
    // 注意：不能寫成 'main h1, h1' 合併查詢——CSS 選擇器清單是照「文件順序」
    // 合併結果，不是「main h1 優先、找不到才退回 h1」。這個頁面在 <main>
    // 外面另外有一個文件順序更早的頁面標題 <h1>Jobs</h1>，合併查詢的
    // .first() 會抓到它，導致公司名稱從錯的容器去找。只用 'main h1'。
    const titleLocator = page.locator('main h1').first();
    // 同一個 /e/<id> 樣式在這個容器裡會命中好幾個連結（logo 圖示、公司名稱、
    // 產業標籤、"Learn more about..." 等），文件順序最前面那個是空文字的
    // logo 連結，用 .first() 只會抓到空字串。改成找「第一個有文字內容」的。
    const employerLinks = titleLocator.locator(
      'xpath=ancestor::div[1]//a[starts-with(@href, "/e/")]'
    );
    const employerTexts = await employerLinks.allInnerTexts().catch(() => []);
    company = (employerTexts.find(t => t.trim()) || '').trim();
  }

  return {
    source: 'handshake',
    title,
    company,
    jd: description,
    url: page.url().split('?')[0],
    scrapedAt: new Date().toISOString()
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const profilePath = path.resolve(options.profile);
  await mkdir(profilePath, { recursive: true });

  // Use installed Chrome with a dedicated persistent profile. This keeps the
  // Handshake/SSO session without reading the user's normal Chrome profile.
  const context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chrome',
    headless: options.headless
  });
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    });

    if (/\/access(?:[/?#]|$)|login|sign.?in/i.test(page.url())) {
      throw new Error(
        'Handshake session 已失效。請先執行 npm run auth:handshake 重新登入。'
      );
    }

    const job = await extractHandshakeJob(page);
    const json = `${JSON.stringify(job, null, 2)}\n`;

    if (options.output) {
      const outputPath = path.resolve(options.output);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, json, 'utf8');
      console.error(`已儲存：${outputPath}`);
    } else {
      process.stdout.write(json);
    }
  } finally {
    await context.close();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch(error => {
    console.error(`Handshake 爬蟲失敗：${error.message}`);
    process.exitCode = 1;
  });
}
