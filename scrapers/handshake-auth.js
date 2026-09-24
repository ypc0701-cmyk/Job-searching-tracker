#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';

const profilePath = path.resolve(process.argv[2] || '.auth/handshake-profile');
await mkdir(profilePath, { recursive: true });

// A dedicated persistent Chrome profile is more reliable for university SSO
// than a fresh bundled Chromium context. It never touches the user's regular
// Chrome profile, passwords, or cookies.
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: false
});
const page = context.pages()[0] || await context.newPage();
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  await page.goto('https://app.joinhandshake.com/', { waitUntil: 'domcontentloaded' });
  console.log(`專用登入 profile：${profilePath}`);
  await prompt.question('請在 Chrome 完成 Handshake／學校 SSO 登入，成功進入 Handshake 後按 Enter：');

  if (/\/access(?:[/?#]|$)|login|sign.?in/i.test(page.url())) {
    throw new Error('目前仍停留在登入頁，session 尚未建立。');
  }

  console.log(`登入成功，session 已保存在：${profilePath}`);
} finally {
  prompt.close();
  await context.close();
}
