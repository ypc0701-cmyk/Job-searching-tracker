import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

import { extractHandshakeJob, parseArgs } from '../scrapers/handshake.js';

test('只接受 Handshake HTTPS 網址', () => {
  const options = parseArgs(['--url', 'https://app.joinhandshake.com/stu/jobs/123']);
  assert.equal(options.url, 'https://app.joinhandshake.com/stu/jobs/123');
  assert.equal(options.profile, '.auth/handshake-profile');
  assert.throws(() => parseArgs(['--url', 'https://example.com/job/123']));
});

test('以 Job description 錨點擷取相鄰內容，不包含外層文字或 Less 按鈕', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setContent(`
      <main>
        <h1>Data Analyst Intern</h1>
        <div data-hook="employer-name">Example Company</div>
        <p>這是頁面其他文字，不應出現在 JD。</p>
        <div class="random-wrapper">
          <div class="random-header"><h3 class="random-heading">Job description</h3></div>
          <div><div>
            <p>${'Analyze business data and build dashboards. '.repeat(4)}</p>
            <ul><li>Use SQL and Python</li><li>Present actionable insights</li></ul>
          </div></div>
          <button type="button">Less</button>
        </div>
      </main>
    `);

    const job = await extractHandshakeJob(page);
    assert.match(job.jd, /Analyze business data/);
    assert.match(job.jd, /Use SQL and Python/);
    assert.doesNotMatch(job.jd, /頁面其他文字/);
    assert.doesNotMatch(job.jd, /Less/);
    assert.equal(job.title, 'Data Analyst Intern');
    assert.equal(job.company, 'Example Company');
  } finally {
    await browser.close();
  }
});
