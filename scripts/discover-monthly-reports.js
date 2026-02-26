#!/usr/bin/env node
// Discovery script: maps the Monthly Reports form structure
// Clicks "Resume" on the open report, walks through each page, captures fields
// DOES NOT submit anything -- stops at confirmation/review pages
// Run: node scripts/discover-monthly-reports.js
// Output: data/monthly-reports-discovery/

const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DATA_DIR = path.join(__dirname, '../data/monthly-reports-discovery');

async function captureCurrentPage(page, pageNum, formStructure) {
  const shotPath = path.join(DATA_DIR, `page-${String(pageNum).padStart(2, '0')}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`[*] Screenshot: ${shotPath}`);

  const fields = await page.evaluate(() => {
    const result = { url: location.href, title: document.title, fields: [], links: [], bodyPreview: '' };

    // Form fields
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.type === 'hidden' && !el.name) return;
      const label = el.labels?.[0]?.innerText?.trim() || '';
      const closestLabel = !label ? (el.closest('div, td, li')?.querySelector('label, span.label, .field-label')?.innerText?.trim() || '') : '';
      const options = el.tagName === 'SELECT'
        ? Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
        : undefined;
      result.fields.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        id: el.id || '',
        label: label || closestLabel,
        value: el.value || '',
        checked: el.checked || false,
        disabled: el.disabled || false,
        required: el.required || false,
        options
      });
    });

    // Radio/checkbox groups
    document.querySelectorAll('fieldset, .form-group, .question, .radio-group, .checkbox-group').forEach(group => {
      const legend = group.querySelector('legend, label:first-child, h3, h4, .group-label');
      const inputs = group.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      if (legend && inputs.length > 0) {
        const choices = Array.from(inputs).map(i => ({
          value: i.value,
          name: i.name,
          label: i.labels?.[0]?.innerText?.trim() || i.nextSibling?.textContent?.trim() || i.value,
          checked: i.checked
        }));
        result.fields.push({
          tag: 'group',
          type: inputs[0].type,
          label: legend.innerText.trim(),
          name: inputs[0].name,
          choices
        });
      }
    });

    // All clickable navigation elements
    document.querySelectorAll('a, button, input[type="submit"], input[type="button"]').forEach(el => {
      const text = (el.innerText || el.value || '').trim();
      if (text && text.length < 100) {
        result.links.push({ text, tag: el.tagName, href: el.href || '', type: el.type || '', id: el.id || '' });
      }
    });

    result.bodyPreview = document.body.innerText.substring(0, 5000);
    return result;
  });

  formStructure.push(fields);
  return fields;
}

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

  // Navigate to Monthly Reports
  console.log('[*] Going to Monthly Reports...');
  await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  let pageNum = 0;
  const formStructure = [];

  // Capture the landing page (report list)
  pageNum++;
  await captureCurrentPage(page, pageNum, formStructure);
  console.log('[*] Captured landing page');

  // Click "Resume" to enter the open report form
  console.log('[*] Looking for Resume button...');
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('a, button, input[type="submit"]')];
    for (const el of els) {
      const text = (el.innerText || el.value || '').trim().toLowerCase();
      if (text.includes('resume') || text.includes('start') || text.includes('begin')) {
        el.click();
        return (el.innerText || el.value || '').trim();
      }
    }
    return null;
  });

  if (!clicked) {
    console.log('[!] No Resume/Start button found. Check screenshot.');
    await browser.close();
    process.exit(1);
  }

  console.log(`[+] Clicked: "${clicked}"`);
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Walk through form pages (max 20)
  for (let i = 0; i < 20; i++) {
    pageNum++;
    const currentPage = await captureCurrentPage(page, pageNum, formStructure);

    console.log(`[*] Page ${pageNum}: ${currentPage.url}`);
    console.log(`    Fields: ${currentPage.fields.length}`);
    console.log(`    Links: ${currentPage.links.map(l => l.text).join(', ')}`);

    // Check if this is a review/confirmation/submit page -- STOP here
    const bodyLower = currentPage.bodyPreview.toLowerCase();
    if (bodyLower.includes('review your') || bodyLower.includes('confirm and submit') || bodyLower.includes('review and submit')) {
      console.log('[!] Hit review/confirmation page. Stopping before submit.');
      break;
    }

    // Look for Next/Continue/Save and Continue button
    const nextBtn = currentPage.links.find(l => {
      const t = l.text.toLowerCase();
      return t.match(/^(next|continue|save and continue|save & continue|proceed)$/i) ||
             t.includes('next') || t.includes('continue');
    });

    // Exclude submit/finish buttons
    const isSubmit = nextBtn && nextBtn.text.toLowerCase().match(/submit|finish|complete|confirm/);

    if (!nextBtn || isSubmit) {
      console.log(`[*] No safe next button found. Last link texts: ${currentPage.links.map(l => l.text).join(', ')}`);
      break;
    }

    console.log(`[*] Clicking: "${nextBtn.text}"`);
    await page.evaluate((text) => {
      const els = [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')];
      const el = els.find(e => {
        const t = (e.innerText || e.value || '').trim();
        return t === text;
      });
      if (el) el.click();
    }, nextBtn.text);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
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
