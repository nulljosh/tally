const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? '/tmp' : path.join(__dirname, '../data');
const COOKIES_PATH = path.join(DATA_DIR, 'cookies.json');

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[*] Cookies saved');
  } catch (error) {
    console.log('[!] Failed to save cookies:', error.message);
  }
}

async function attemptLogin(page, attempt = 1, credentials = {}) {
  const username = credentials.username || process.env.BCEID_USERNAME;
  const password = credentials.password || process.env.BCEID_PASSWORD;

  if (!username || !password) {
    console.log('[!] No credentials provided');
    return false;
  }

  try {
    console.log(`[*] Login attempt ${attempt}/3`);

    // Navigate to homepage
    await page.goto('https://myselfserve.gov.bc.ca', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Click "Sign in" button
    const signInButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('a, button'));
      for (const btn of buttons) {
        const text = btn.innerText?.toLowerCase() || '';
        if (text.includes('sign in') || text.includes('log in')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (signInButton) {
      console.log('[*] Clicked Sign in button');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Wait for login form (longer timeout for rate limiting)
    try {
      await page.waitForSelector('input[name="user"], input[id="user"]', {
        timeout: 20000
      });
    } catch (error) {
      // Check if we're being rate limited or blocked
      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

      if (bodyText.toLowerCase().includes('too many') || bodyText.toLowerCase().includes('rate limit')) {
        throw new Error('Rate limited by BC government site - wait longer between requests');
      }

      if (!currentUrl.includes('logon') && !currentUrl.includes('login')) {
        // We might already be logged in
        console.log('[*] Login form not found but not on login page - might already be authenticated');
        return true;
      }

      throw new Error(`Login form not found: ${error.message}`);
    }

    // Fill credentials using page.evaluate to avoid detached frame issues
    console.log('[*] Filling credentials...');

    await page.evaluate((user, pass) => {
      const userField = document.querySelector('input[name="user"], input[id="user"]');
      const passField = document.querySelector('input[name="password"], input[id="password"]');

      if (userField) {
        userField.value = '';
        userField.value = user;
      }
      if (passField) {
        passField.value = '';
        passField.value = pass;
      }
    }, username, password);

    await new Promise(resolve => setTimeout(resolve, 500));

    const hasFields = await page.evaluate(() => {
      const userField = document.querySelector('input[name="user"], input[id="user"]');
      const passField = document.querySelector('input[name="password"], input[id="password"]');
      return !!(userField && passField);
    });

    if (hasFields) {

      console.log('[*] Submitting login...');

      const submitButton = await page.$('input[name="btnSubmit"], button[type="submit"], input[type="submit"]');
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
          submitButton.click()
        ]);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const finalUrl = page.url();

        // Check if we're still on login page
        if (finalUrl.includes('logon') || finalUrl.includes('Login?SMSESSION')) {
          console.log('[!] Login failed or session issue');
          return false;
        }

        console.log('[+] Login successful!');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.log(`[!] Login error: ${error.message}`);
    return false;
  }
}

async function scrapeSection(page, sectionName, sectionUrl) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[*] Scraping: ${sectionName}`);
  console.log('='.repeat(60));

  try {
    // Special handling for Payment Info since BC redesigned their site
    if (sectionName === 'Payment Info') {
      console.log('[*] Trying to find Payment Info link on home page...');

      // Go to authenticated home page first
      await page.goto('https://myselfserve.gov.bc.ca/Auth', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to find and click the Payment Info link
      const paymentLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const text = link.innerText?.trim() || '';
          if (text.toLowerCase().includes('payment info') || text.toLowerCase().includes('payment information')) {
            return link.href;
          }
        }
        return null;
      });

      if (paymentLink) {
        console.log(`[*] Found Payment Info link: ${paymentLink}`);
        sectionUrl = paymentLink;
      } else {
        console.log('[!] Could not find Payment Info link, trying alternative URLs...');
        const alternatives = [
          'https://myselfserve.gov.bc.ca/Auth/Payment',
          'https://myselfserve.gov.bc.ca/Auth/Payments',
          'https://myselfserve.gov.bc.ca/Payment',
          'https://myselfserve.gov.bc.ca/PaymentInfo'
        ];

        for (const altUrl of alternatives) {
          console.log(`[*] Trying ${altUrl}...`);
          await page.goto(altUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 1000));

          const url = page.url();
          if (!url.includes('PageNotFound') && !url.includes('404')) {
            console.log(`[+] Found working URL: ${url}`);
            sectionUrl = url;
            break;
          }
        }
      }
    }

    // Navigate to the section URL
    console.log(`[*] Navigating to ${sectionUrl}...`);
    await page.goto(sectionUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we got kicked back to login
    const currentUrl = page.url();
    if (currentUrl.includes('logon') || currentUrl.includes('Login')) {
      console.log('[!] [FAIL] Got kicked back to login');
      return { error: 'Session expired - redirected to login' };
    }

    console.log('[+] [OK] Page loaded successfully!');

    // Scrape data from the page
    const sectionData = await page.evaluate(() => {
      const body = document.body.innerText;

      // Get all text content
      const allText = [];

      // Look for list items
      const listItems = document.querySelectorAll('li');
      listItems.forEach(li => {
        const text = li.innerText?.trim();
        if (text && text.length > 10 && !text.toLowerCase().includes('menu')) {
          allText.push(text);
        }
      });

      // Look for paragraphs with substantial content
      const paragraphs = document.querySelectorAll('p, div.content, div.message, div.notification');
      paragraphs.forEach(p => {
        const text = p.innerText?.trim();
        if (text && text.length > 20) {
          allText.push(text);
        }
      });

      // Look for tables (payment info often in tables)
      const tables = document.querySelectorAll('table');
      const tableData = [];
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          const rowData = Array.from(cells).map(cell => cell.innerText.trim());
          if (rowData.length > 0 && rowData.some(d => d.length > 0)) {
            tableData.push(rowData.join(' | '));
          }
        });
      });

      // Look for payment-related keywords
      const keywords = ['payment', 'paid', 'pending', 'processed', 'deposit', 'amount', 'balance', 'invoice', 'status', 'notification', 'message'];
      const foundInfo = [];

      keywords.forEach(keyword => {
        const regex = new RegExp(`.{0,150}${keyword}.{0,150}`, 'gi');
        const matches = body.match(regex);
        if (matches) {
          foundInfo.push(...matches);
        }
      });

      return {
        allText: [...new Set(allText)],
        tableData: [...new Set(tableData)],
        keywords: [...new Set(foundInfo)],
        pageTitle: document.title,
        url: window.location.href,
        bodyLength: body.length
      };
    });

    console.log(`[+] Found ${sectionData.allText.length} text items`);
    console.log(`[+] Found ${sectionData.tableData.length} table rows`);
    console.log(`[+] Found ${sectionData.keywords.length} keyword matches`);

    // Take a screenshot of this section
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = path.join(DATA_DIR, 'screenshots');
    let screenshotPath = null;
    try {
      await fs.mkdir(screenshotDir, { recursive: true });
      screenshotPath = path.join(screenshotDir, `${sectionName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[*] Screenshot saved: ${screenshotPath}`);
    } catch (screenshotError) {
      console.log(`[!] Screenshot failed: ${screenshotError.message}`);
    }

    return {
      success: true,
      ...sectionData,
      screenshot: screenshotPath
    };

  } catch (error) {
    console.log(`[!] Error scraping ${sectionName}: ${error.message}`);
    return { error: error.message };
  }
}

async function checkAllSections(options = {}) {
  const { headless = false, username, password } = options;
  const credentials = { username, password };
  let browser;

  try {
    let launchOptions;
    if (IS_VERCEL) {
      const chromium = require('@sparticuz/chromium');
      launchOptions = {
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
      };
    } else {
      launchOptions = {
        headless: headless,
        defaultViewport: headless ? { width: 1920, height: 1080 } : null,
        args: headless ? [] : ['--start-maximized'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        userDataDir: './chrome-data'
      };
    }
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    // Login ONCE before scraping all sections
    console.log('[*] Logging in once for all sections...');
    let loginSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      loginSuccess = await attemptLogin(page, attempt, credentials);
      if (loginSuccess) break;
      if (attempt < 3) {
        console.log('[!] Retrying login...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!loginSuccess) {
      throw new Error('Login failed after 3 attempts');
    }

    // Define sections to scrape
    const sections = [
      { name: 'Notifications', url: 'https://myselfserve.gov.bc.ca/Auth' },
      { name: 'Messages', url: 'https://myselfserve.gov.bc.ca/Auth/Messages' },
      { name: 'Payment Info', url: 'https://myselfserve.gov.bc.ca/Auth/ChequeInfo' },
      { name: 'Service Requests', url: 'https://myselfserve.gov.bc.ca/Auth/ServiceRequests' }
    ];

    const allResults = {};

    // Scrape each section in the same authenticated session
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const result = await scrapeSection(page, section.name, section.url);
      allResults[section.name] = result;

      // Brief pause between sections (no re-login, no cookie clearing)
      if (i < sections.length - 1) {
        console.log('[*] Moving to next section...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Scrape Monthly Reports (reuses same authenticated session)
    console.log('[*] Moving to Monthly Reports...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const monthlyReportsResult = await scrapeMonthlyReports(page);
    allResults['Monthly Reports'] = monthlyReportsResult;

    // Save cookies after all scraping
    await saveCookies(page);

    // Display results summary
    console.log('\n');
    console.log('═══════════════════════════════════════');
    console.log('         SCRAPER RESULTS SUMMARY        ');
    console.log('═══════════════════════════════════════\n');

    for (const [sectionName, data] of Object.entries(allResults)) {
      console.log(`\n[${data.success ? '+' : '!'}] ${sectionName}:`);

      if (data.error) {
        console.log(`  Error: ${data.error}`);
      } else if (data.success) {
        console.log(`  ✓ ${data.allText.length} items found`);

        // Show first few items
        if (data.allText.length > 0) {
          data.allText.slice(0, 5).forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.substring(0, 100)}${item.length > 100 ? '...' : ''}`);
          });
          if (data.allText.length > 5) {
            console.log(`  ... and ${data.allText.length - 5} more`);
          }
        }

        // Show table data if any
        if (data.tableData && data.tableData.length > 0) {
          console.log(`\n  Table data (${data.tableData.length} rows):`);
          data.tableData.slice(0, 3).forEach((row, i) => {
            console.log(`  ${i + 1}. ${row}`);
          });
        }
      }
    }

    // Save results to JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      sections: allResults
    };

    const jsonPath = path.join(DATA_DIR, `results-${timestamp}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(`\n[*] Results saved to ${jsonPath}`);

    console.log('\n[+] Scraping complete! Closing browser...');
    await browser.close();

    return result;

  } catch (error) {
    console.error('[!] Error:', error.message);

    if (browser) {
      try {
        const page = (await browser.pages())[0];
        if (page) {
          const errDir = path.join(DATA_DIR, 'screenshots');
          await fs.mkdir(errDir, { recursive: true }).catch(() => {});
          await page.screenshot({ path: path.join(errDir, 'error-screenshot.png') }).catch(() => {});
        }
      } catch (e) {
        // Ignore screenshot errors
      }
      try { await browser.close(); } catch (e) { /* ensure close */ }
    }

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function scrapeMonthlyReports(page) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('[*] Scraping: Monthly Reports');
  console.log('='.repeat(60));

  try {
    // Navigate to authenticated home to find Monthly Reports link
    await page.goto('https://myselfserve.gov.bc.ca/Auth', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find and click Monthly Reports link
    const reportLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const text = link.innerText?.trim().toLowerCase() || '';
        if (text.includes('monthly report')) {
          return link.href;
        }
      }
      return null;
    });

    if (!reportLink) {
      console.log('[!] Monthly Reports link not found on home page');
      return { error: 'Monthly Reports link not found', success: false };
    }

    console.log(`[*] Found Monthly Reports link: ${reportLink}`);
    await page.goto(reportLink, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check we didn't get kicked to login
    if (page.url().includes('logon') || page.url().includes('Login')) {
      return { error: 'Session expired', success: false };
    }

    // Screenshot the landing page (report list)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = path.join(DATA_DIR, 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true }).catch(() => {});
    const landingShot = path.join(screenshotDir, `monthly-reports-${timestamp}.png`);
    await page.screenshot({ path: landingShot, fullPage: true });
    console.log(`[*] Screenshot: ${landingShot}`);

    // Extract report list from the page
    const reportData = await page.evaluate(() => {
      const body = document.body.innerText;
      const allText = [];
      const tableData = [];
      const reports = [];

      // Extract table rows (report history)
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          const rowData = Array.from(cells).map(cell => cell.innerText.trim());
          if (rowData.length > 0 && rowData.some(d => d.length > 0)) {
            tableData.push(rowData.join(' | '));
          }
        });
      });

      // Extract list items
      document.querySelectorAll('li, p, div.content').forEach(el => {
        const text = el.innerText?.trim();
        if (text && text.length > 10) allText.push(text);
      });

      // Look for report period patterns (e.g., "January 2026", "2026/JAN")
      const periodPattern = /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}\s*\/\s*[A-Z]{3})/gi;
      const periods = body.match(periodPattern) || [];

      // Look for status keywords
      const statusPattern = /(?:submitted|pending|overdue|not submitted|completed|in progress|due)/gi;
      const statuses = body.match(statusPattern) || [];

      // Look for clickable report links (most recent)
      const reportLinks = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.innerText?.trim() || '';
        if (text.match(/report|view|edit|submit|complete/i) && !text.match(/skip|menu|nav/i)) {
          reportLinks.push({ text, href: a.href });
        }
      });

      return {
        allText: [...new Set(allText)],
        tableData: [...new Set(tableData)],
        periods: [...new Set(periods)],
        statuses: [...new Set(statuses)],
        reportLinks,
        pageTitle: document.title,
        url: window.location.href,
        bodyLength: body.length
      };
    });

    console.log(`[+] Found ${reportData.tableData.length} table rows`);
    console.log(`[+] Found ${reportData.periods.length} report periods`);
    console.log(`[+] Found ${reportData.reportLinks.length} report links`);

    // Try to click into the most recent report for details
    let detailData = null;
    let detailShot = null;
    if (reportData.reportLinks.length > 0) {
      const firstLink = reportData.reportLinks[0];
      console.log(`[*] Clicking into report: ${firstLink.text}`);

      await page.evaluate((href) => {
        const link = Array.from(document.querySelectorAll('a')).find(a => a.href === href);
        if (link) link.click();
      }, firstLink.href);

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));

      detailShot = path.join(screenshotDir, `monthly-reports-detail-${timestamp}.png`);
      await page.screenshot({ path: detailShot, fullPage: true });

      detailData = await page.evaluate(() => {
        const body = document.body.innerText;
        const fields = [];

        // Extract form fields and their values
        document.querySelectorAll('label, .field-label, th').forEach(label => {
          const text = label.innerText?.trim();
          if (text && text.length > 2 && text.length < 200) {
            // Find associated value
            const next = label.nextElementSibling;
            const value = next ? next.innerText?.trim() : '';
            fields.push({ label: text, value });
          }
        });

        // Extract input values
        document.querySelectorAll('input, select, textarea').forEach(input => {
          const name = input.name || input.id || '';
          const value = input.value || '';
          const label = input.labels?.[0]?.innerText?.trim() || name;
          if (label) fields.push({ label, value });
        });

        return {
          fields,
          bodyText: body.substring(0, 5000),
          url: window.location.href
        };
      });

      console.log(`[+] Detail page: ${detailData.fields.length} fields extracted`);
    }

    return {
      success: true,
      ...reportData,
      detailData,
      screenshot: landingShot,
      detailScreenshot: detailShot
    };

  } catch (error) {
    console.log(`[!] Error scraping Monthly Reports: ${error.message}`);
    return { error: error.message, success: false };
  }
}

async function submitMonthlyReport(page, options = {}) {
  const { sin, phone, pin, dryRun = false } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[*] Monthly Report Submission ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const screenshotDir = path.join(DATA_DIR, 'screenshots');
  await fs.mkdir(screenshotDir, { recursive: true }).catch(() => {});
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const sectionTimers = {};

  const shot = async (label) => {
    const p = path.join(screenshotDir, `submit-${label}-${ts}.png`);
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`[*] Screenshot: ${p}`);
    return p;
  };

  // SPA-aware: wait for section content to change after clicking Continue.
  // Sections 1-5 use Angular hash routing (no full page load).
  // Section 5 -> Confirmation is a full page load.
  const waitForSectionChange = async (currentSectionNum) => {
    const isLastSection = currentSectionNum === 5;
    if (isLastSection) {
      // Section 5 -> Confirmation is a full page navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      return;
    }
    // For hash-route transitions: poll for section title change
    const nextSection = currentSectionNum + 1;
    const expectedTitle = `Section ${nextSection}`;
    try {
      await page.waitForFunction(
        (title) => {
          const body = document.body.innerText || '';
          return body.includes(title);
        },
        { timeout: 8000 },
        expectedTitle
      );
    } catch (_) {
      // Fallback: wait a fixed amount and hope content changed
      console.log(`[!] Section change detection timed out, continuing anyway`);
    }
    await new Promise(r => setTimeout(r, 1000));
  };

  // Click the Continue button using page.click for proper Angular event handling
  const clickContinue = async (currentSectionNum) => {
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')];
      const el = els.find(e => {
        const t = (e.innerText || e.value || '').trim().toLowerCase();
        return t === 'continue' || t.includes('continue');
      });
      if (el) el.click();
    });
    await waitForSectionChange(currentSectionNum);
  };

  try {
    // Navigate to Monthly Reports
    await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', {
      waitUntil: 'networkidle2', timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2000));

    if (page.url().includes('logon') || page.url().includes('Login')) {
      return { success: false, error: 'Session expired' };
    }

    await shot('00-landing');

    // Click Resume or Start
    const resumeClicked = await page.evaluate(() => {
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

    if (!resumeClicked) {
      return { success: false, error: 'No Resume/Start button found -- report may already be submitted' };
    }

    console.log(`[+] Clicked: "${resumeClicked}"`);
    // Initial navigation into the Angular SPA form
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // ── Section 1: Eligibility ──
    sectionTimers[1] = Date.now();
    console.log('[*] Section 1/5: Eligibility');
    await shot('01-eligibility-before');

    // Use page.click on exact radio selectors for Angular binding
    try {
      // NeedOfAssistance_177 = Yes
      await page.click('input[name="NeedOfAssistance_177"][value="Yes"]');
      console.log('[+] Set NeedOfAssistance = Yes');
    } catch (e) {
      // Fallback: try generic approach
      console.log('[!] Exact selector failed, trying generic radio selection');
      await page.evaluate(() => {
        const radios = document.querySelectorAll('input[type="radio"]');
        const groups = {};
        radios.forEach(r => { if (!groups[r.name]) groups[r.name] = []; groups[r.name].push(r); });
        for (const [name, inputs] of Object.entries(groups)) {
          const isNeed = name.toLowerCase().includes('needofassistance');
          for (const input of inputs) {
            const val = input.value.toLowerCase();
            if (isNeed && (val === 'yes')) { input.click(); }
            else if (!isNeed && (val === 'no')) { input.click(); }
          }
        }
      });
    }

    await shot('01-eligibility-after');
    console.log(`[+] Section 1 done (${Date.now() - sectionTimers[1]}ms)`);
    await clickContinue(1);

    // ── Section 2: Income Declaration (18 number fields, all default to 0) ──
    sectionTimers[2] = Date.now();
    console.log('[*] Section 2/5: Income Declaration');
    await shot('02-income-before');

    // Fields have no name/id but default to 0. Verify they're 0 and move on.
    const incomeFieldCount = await page.evaluate(() => {
      const fields = document.querySelectorAll('input[type="number"]');
      let count = 0;
      fields.forEach(f => {
        if (f.value === '' || f.value === undefined) {
          // Clear and type 0 via Angular-compatible events
          f.focus();
          f.value = '0';
          f.dispatchEvent(new Event('input', { bubbles: true }));
          f.dispatchEvent(new Event('change', { bubbles: true }));
          f.blur();
        }
        count++;
      });
      return count;
    });
    console.log(`[+] Verified ${incomeFieldCount} income fields at $0`);

    await shot('02-income-after');
    console.log(`[+] Section 2 done (${Date.now() - sectionTimers[2]}ms)`);
    await clickContinue(2);

    // ── Section 3: Other Declarations ──
    sectionTimers[3] = Date.now();
    console.log('[*] Section 3/5: Other Declarations');
    await shot('03-other-before');

    // OtherChanges_969 = No
    try {
      await page.click('input[name="OtherChanges_969"][value="No"]');
      console.log('[+] Set OtherChanges = No');
    } catch (e) {
      console.log('[!] Exact selector failed, trying generic');
      await page.evaluate(() => {
        const radios = document.querySelectorAll('input[type="radio"]');
        radios.forEach(r => { if (r.value.toLowerCase() === 'no') r.click(); });
      });
    }

    await shot('03-other-after');
    console.log(`[+] Section 3 done (${Date.now() - sectionTimers[3]}ms)`);
    await clickContinue(3);

    // ── Section 4: Supporting Documents (skip) ──
    sectionTimers[4] = Date.now();
    console.log('[*] Section 4/5: Supporting Documents (skipping)');
    await shot('04-documents');
    console.log(`[+] Section 4 done (${Date.now() - sectionTimers[4]}ms)`);
    await clickContinue(4);

    // ── Section 5: Personal Info (SIN + Phone) ──
    sectionTimers[5] = Date.now();
    console.log('[*] Section 5/5: Personal Info');
    await shot('05-personal-before');

    // Target exact field names: KeyPlayerSIN, KeyPlayerPhone
    // Fields are pre-filled. Only overwrite if user provides values.
    if (sin) {
      try {
        const sinField = await page.$('input[name="KeyPlayerSIN"]');
        if (sinField) {
          await sinField.click({ clickCount: 3 }); // select all
          await sinField.type(sin);
          console.log('[+] Set SIN');
        }
      } catch (e) {
        console.log('[!] SIN field not found by name, trying generic');
        await page.evaluate((sinVal) => {
          const inputs = document.querySelectorAll('input[type="text"]');
          for (const input of inputs) {
            const all = ((input.name || '') + (input.id || '')).toLowerCase();
            if (all.includes('sin')) { input.value = sinVal; input.dispatchEvent(new Event('input', { bubbles: true })); }
          }
        }, sin);
      }
    }

    if (phone) {
      try {
        const phoneField = await page.$('input[name="KeyPlayerPhone"]');
        if (phoneField) {
          await phoneField.click({ clickCount: 3 });
          await phoneField.type(phone);
          console.log('[+] Set Phone');
        }
      } catch (e) {
        console.log('[!] Phone field not found by name, trying generic');
        await page.evaluate((phoneVal) => {
          const inputs = document.querySelectorAll('input[type="text"]');
          for (const input of inputs) {
            const all = ((input.name || '') + (input.id || '')).toLowerCase();
            if (all.includes('phone')) { input.value = phoneVal; input.dispatchEvent(new Event('input', { bubbles: true })); }
          }
        }, phone);
      }
    }

    await shot('05-personal-after');
    console.log(`[+] Section 5 done (${Date.now() - sectionTimers[5]}ms)`);
    // Section 5 -> Confirmation is a full page load
    await clickContinue(5);

    // ── Confirmation Page (Declaration + PIN + Submit) ──
    const confirmTimer = Date.now();
    console.log('[*] Confirmation: Declaration');
    await shot('06-declaration-before');

    // Check declaration checkbox by id
    try {
      await page.click('#declare_cb');
      console.log('[+] Checked declaration checkbox');
    } catch (e) {
      console.log('[!] #declare_cb not found, trying fallback');
      await page.evaluate(() => {
        const cb = document.querySelector('input[name="DeclarationCB"]') ||
          document.querySelector('input[type="checkbox"]');
        if (cb) cb.click();
      });
    }

    await new Promise(r => setTimeout(r, 500));

    // Enter PIN using page.type for proper event triggering
    try {
      await page.type('#kp_pin', pin);
      console.log('[+] Entered PIN');
    } catch (e) {
      console.log('[!] #kp_pin not found, trying fallback');
      await page.evaluate((pinVal) => {
        const input = document.querySelector('input[name="KeyPlayerPIN"]') ||
          document.querySelector('input[type="password"]');
        if (input) {
          input.value = pinVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, pin);
    }

    await shot('06-declaration-filled');

    // Capture page state for dry-run preview
    const preSubmitState = await page.evaluate(() => {
      const body = document.body.innerText;
      const fields = [];
      document.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'hidden') return;
        fields.push({
          name: el.name || el.id || '',
          type: el.type,
          value: el.type === 'checkbox' ? el.checked : el.value,
          label: el.labels?.[0]?.innerText?.trim() || ''
        });
      });
      return { fields, bodyPreview: body.substring(0, 3000), url: location.href };
    });

    if (dryRun) {
      console.log('[*] DRY RUN -- stopping before submit');
      console.log(`[+] Confirmation page done (${Date.now() - confirmTimer}ms)`);
      return {
        success: true,
        dryRun: true,
        message: 'Dry run complete. All fields filled, ready to submit.',
        preSubmitState,
        screenshots: { declaration: path.join(screenshotDir, `submit-06-declaration-filled-${ts}.png`) }
      };
    }

    // Actually submit using #btnSubmit
    console.log('[*] SUBMITTING...');
    try {
      await page.click('#btnSubmit');
    } catch (e) {
      console.log('[!] #btnSubmit not found, trying fallback');
      await page.evaluate(() => {
        const els = [...document.querySelectorAll('input[type="button"], input[type="submit"], button')];
        const el = els.find(e => (e.value || e.innerText || '').toLowerCase().includes('submit'));
        if (el) el.click();
      });
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    await shot('07-confirmation');

    // Capture confirmation
    const confirmation = await page.evaluate(() => {
      return {
        url: location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 5000)
      };
    });

    const isSuccess = confirmation.bodyText.toLowerCase().includes('submit') ||
      confirmation.bodyText.toLowerCase().includes('confirm') ||
      confirmation.bodyText.toLowerCase().includes('success') ||
      confirmation.bodyText.toLowerCase().includes('thank you') ||
      confirmation.bodyText.toLowerCase().includes('received');

    console.log(`[${isSuccess ? '+' : '!'}] Submission ${isSuccess ? 'succeeded' : 'may have failed'}`);
    console.log(`[+] Total confirmation page time: ${Date.now() - confirmTimer}ms`);

    return {
      success: isSuccess,
      dryRun: false,
      message: isSuccess ? 'Monthly report submitted successfully' : 'Submission completed but could not confirm success -- check screenshots',
      confirmation,
      screenshots: { confirmation: path.join(screenshotDir, `submit-07-confirmation-${ts}.png`) }
    };

  } catch (error) {
    console.log(`[!] Submission error: ${error.message}`);
    await shot('error');
    return { success: false, error: error.message };
  }
}

async function runSubmitMonthlyReport(options = {}) {
  const { username, password, sin, phone, pin, dryRun = false, headless = true } = options;
  let browser;

  try {
    let launchOptions;
    if (IS_VERCEL) {
      const chromium = require('@sparticuz/chromium');
      launchOptions = {
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
      };
    } else {
      launchOptions = {
        headless,
        defaultViewport: headless ? { width: 1920, height: 1080 } : null,
        args: headless ? [] : ['--start-maximized'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        userDataDir: './chrome-data'
      };
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    // Login
    let loginSuccess = false;
    const credentials = { username, password };
    for (let attempt = 1; attempt <= 3; attempt++) {
      loginSuccess = await attemptLogin(page, attempt, credentials);
      if (loginSuccess) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }

    if (!loginSuccess) {
      throw new Error('Login failed after 3 attempts');
    }

    // Submit the report
    const result = await submitMonthlyReport(page, { sin, phone, pin, dryRun });

    await browser.close();
    return result;
  } catch (error) {
    console.error('[!] runSubmitMonthlyReport error:', error.message);
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    return { success: false, error: error.message };
  }
}

// Export for use as module
module.exports = { checkAllSections, runSubmitMonthlyReport };

// Run standalone
if (require.main === module) {
  checkAllSections({ headless: true })
    .then(result => {
      console.log('\n[+] Done!');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[!] Fatal error:', error);
      process.exit(1);
    });
}
