#!/usr/bin/env node
// One-time discovery script: maps the Monthly Reports form structure
// Run: node scripts/discover-monthly-reports.js
// Output: data/monthly-reports-discovery/

const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DATA_DIR = path.join(__dirname, '../data/monthly-reports-discovery');

async function discover() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: './chrome-data'
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  // Login
  console.log('[*] Logging in...');
  await page.goto('https://myselfserve.gov.bc.ca', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('a, button'));
    for (const b of btns) {
      if ((b.innerText || '').toLowerCase().includes('sign in')) { b.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 3000));

  await page.waitForSelector('input[name="user"], input[id="user"]', { timeout: 20000 });
  await page.evaluate((u, p) => {
    const uf = document.querySelector('input[name="user"], input[id="user"]');
    const pf = document.querySelector('input[name="password"], input[id="password"]');
    if (uf) uf.value = u;
    if (pf) pf.value = p;
  }, process.env.BCEID_USERNAME, process.env.BCEID_PASSWORD);

  await new Promise(r => setTimeout(r, 500));
  const submit = await page.$('input[name="btnSubmit"], button[type="submit"], input[type="submit"]');
  if (submit) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      submit.click()
    ]);
  }
  await new Promise(r => setTimeout(r, 3000));

  if (page.url().includes('logon')) {
    console.log('[!] Login failed');
    await browser.close();
    process.exit(1);
  }
  console.log('[+] Logged in');

  // Find Monthly Reports link
  await page.goto('https://myselfserve.gov.bc.ca/Auth', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const reportLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    for (const l of links) {
      if ((l.innerText || '').toLowerCase().includes('monthly report')) return l.href;
    }
    return null;
  });

  if (!reportLink) {
    console.log('[!] Monthly Reports link not found');
    await page.screenshot({ path: path.join(DATA_DIR, 'home-page.png'), fullPage: true });
    await browser.close();
    process.exit(1);
  }

  console.log(`[*] Found link: ${reportLink}`);
  await page.goto(reportLink, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot and extract each page
  let pageNum = 0;
  const formStructure = [];

  async function captureCurrentPage() {
    pageNum++;
    const shotPath = path.join(DATA_DIR, `page-${String(pageNum).padStart(2, '0')}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`[*] Screenshot: ${shotPath}`);

    const fields = await page.evaluate(() => {
      const result = { url: location.href, title: document.title, fields: [], links: [], bodyPreview: '' };

      // Form fields
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const label = el.labels?.[0]?.innerText?.trim() || el.name || el.id || '';
        const options = el.tagName === 'SELECT'
          ? Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
          : undefined;
        result.fields.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          name: el.name || '',
          id: el.id || '',
          label,
          value: el.value || '',
          options
        });
      });

      // Radio/checkbox groups
      document.querySelectorAll('fieldset, .form-group, .question').forEach(group => {
        const legend = group.querySelector('legend, label, h3, h4');
        const inputs = group.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (legend && inputs.length > 0) {
          const choices = Array.from(inputs).map(i => ({
            value: i.value,
            label: i.labels?.[0]?.innerText?.trim() || i.value,
            checked: i.checked
          }));
          result.fields.push({
            tag: 'group',
            type: inputs[0].type,
            label: legend.innerText.trim(),
            choices
          });
        }
      });

      // Navigation links (Next, Continue, Submit, etc.)
      document.querySelectorAll('a, button, input[type="submit"]').forEach(el => {
        const text = (el.innerText || el.value || '').trim();
        if (text.match(/next|continue|submit|save|back|previous|cancel/i)) {
          result.links.push({ text, tag: el.tagName, href: el.href || '' });
        }
      });

      result.bodyPreview = document.body.innerText.substring(0, 3000);
      return result;
    });

    formStructure.push(fields);
    return fields;
  }

  // Capture initial page
  let currentPage = await captureCurrentPage();

  // Click through pages (max 20 to prevent infinite loops)
  for (let i = 0; i < 20; i++) {
    const nextLink = currentPage.links.find(l =>
      l.text.match(/^(next|continue)$/i) && !l.text.match(/submit/i)
    );

    if (!nextLink) {
      console.log('[*] No more Next/Continue buttons found. Stopping.');
      break;
    }

    console.log(`[*] Clicking: ${nextLink.text}`);
    await page.evaluate((text) => {
      const els = [...document.querySelectorAll('a, button, input[type="submit"]')];
      const el = els.find(e => (e.innerText || e.value || '').trim().toLowerCase() === text.toLowerCase());
      if (el) el.click();
    }, nextLink.text);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // Check if we hit a submit/confirmation page
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (bodyText.includes('confirm') || bodyText.includes('review your')) {
      console.log('[!] Hit confirmation/review page. Stopping before submit.');
      await captureCurrentPage();
      break;
    }

    currentPage = await captureCurrentPage();
  }

  // Save structure
  const outputPath = path.join(DATA_DIR, 'form-structure.json');
  await fs.writeFile(outputPath, JSON.stringify(formStructure, null, 2));
  console.log(`\n[+] Form structure saved to ${outputPath}`);
  console.log(`[+] ${pageNum} pages captured`);
  console.log(`[+] Total fields found: ${formStructure.reduce((n, p) => n + p.fields.length, 0)}`);

  await browser.close();
}

discover().catch(err => {
  console.error('[!] Fatal:', err);
  process.exit(1);
});
