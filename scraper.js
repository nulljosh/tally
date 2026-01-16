const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[*] Cookies saved');
  } catch (error) {
    console.log('[!] Failed to save cookies:', error.message);
  }
}

async function attemptLogin(page, attempt = 1) {
  const username = process.env.BCEID_USERNAME;
  const password = process.env.BCEID_PASSWORD;

  if (!username || !password) {
    console.log('[!] No credentials in .env file');
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

    // Wait for login form
    await page.waitForSelector('input[name="user"], input[id="user"]', {
      timeout: 10000
    });

    const usernameField = await page.$('input[name="user"], input[id="user"]');
    const passwordField = await page.$('input[name="password"], input[id="password"]');

    if (usernameField && passwordField) {
      console.log('[*] Filling credentials...');

      // Triple-clear and fill username
      await usernameField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await usernameField.evaluate(el => el.value = '');
      await usernameField.type(username, { delay: 50 });

      // Triple-clear and fill password
      await passwordField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await passwordField.evaluate(el => el.value = '');
      await passwordField.type(password, { delay: 50 });

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
    // Fresh login for each section to avoid session timeout
    console.log('[*] Logging in for this section...');

    let loginSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      loginSuccess = await attemptLogin(page, attempt);

      if (loginSuccess) {
        break;
      }

      if (attempt < 3) {
        console.log('[!] Retrying login...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!loginSuccess) {
      console.log('[!] Failed to log in for this section');
      return { error: 'Login failed after 3 attempts' };
    }

    // After successful login, immediately navigate to the section
    // Don't give the site time to auto-logout
    console.log(`[*] Navigating to ${sectionUrl}...`);
    await page.goto(sectionUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we got kicked back to login
    const currentUrl = page.url();
    if (currentUrl.includes('logon') || currentUrl.includes('Login')) {
      console.log('[!] ❌ Got kicked back to login');
      return { error: 'Session expired - redirected to login' };
    }

    console.log('[+] ✅ Page loaded successfully!');

    // Scrape data from the page
    const sectionData = await page.evaluate(() => {
      const body = document.body.innerText;
      const html = document.body.innerHTML;

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
    const screenshotPath = `${sectionName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[*] Screenshot saved: ${screenshotPath}`);

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
  const { headless = false } = options;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: headless,
      defaultViewport: headless ? { width: 1920, height: 1080 } : null,
      args: headless ? [] : ['--start-maximized'],
      userDataDir: './chrome-data'
    });

    const page = await browser.newPage();

    // Define sections to scrape
    const sections = [
      { name: 'Notifications', url: 'https://myselfserve.gov.bc.ca/Auth' },
      { name: 'Messages', url: 'https://myselfserve.gov.bc.ca/Auth/Messages' },
      { name: 'Payment Info', url: 'https://myselfserve.gov.bc.ca/Auth/PaymentInfo' },
      { name: 'Service Requests', url: 'https://myselfserve.gov.bc.ca/Auth/ServiceRequests' }
    ];

    const allResults = {};

    // Scrape each section with fresh login
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const result = await scrapeSection(page, section.name, section.url);
      allResults[section.name] = result;

      // Clear cookies and wait longer between sections to avoid rate limiting
      if (i < sections.length - 1) {
        console.log('\n[*] Clearing session and waiting 15 seconds to avoid rate limiting...');

        // Clear all cookies
        const cookies = await page.cookies();
        await page.deleteCookie(...cookies);

        // Clear localStorage and sessionStorage
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });

        // Wait 15 seconds between sections
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

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

    const jsonPath = `results-${timestamp}.json`;
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
          await page.screenshot({ path: 'error-screenshot.png' });
          console.log('[*] Error screenshot saved');
        }
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Export for use as module
module.exports = { checkAllSections, scrapeSection };

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
