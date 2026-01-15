const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function saveCookies(page) {
  const cookies = await page.cookies();
  await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('[*] Cookies saved for future use');
}

async function loadCookies(page) {
  try {
    const cookiesString = await fs.readFile(COOKIES_PATH, 'utf8');
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    console.log('[*] Loaded saved cookies');
    return true;
  } catch (error) {
    console.log('[*] No saved cookies found, will need to login');
    return false;
  }
}

async function attemptLogin(page) {
  const username = process.env.BCEID_USERNAME;
  const password = process.env.BCEID_PASSWORD;

  if (!username || !password) {
    console.log('[!] No credentials in .env file');
    console.log('[*] Please log in manually in the browser...');
    return false;
  }

  try {
    console.log('[*] Attempting automated login...');

    // Wait for username field
    await page.waitForSelector('input[name="user"], input[name="username"], input[type="text"]', {
      timeout: 5000
    });

    // Fill in credentials - adjust selectors based on actual form
    const usernameField = await page.$('input[name="user"], input[name="username"], input[type="text"]');
    const passwordField = await page.$('input[name="password"], input[type="password"]');

    if (usernameField && passwordField) {
      await usernameField.type(username);
      await passwordField.type(password);

      // Look for submit button
      const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      if (submitButton) {
        await submitButton.click();
        console.log('[+] Login form submitted');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.log('[!] Automated login failed, waiting for manual login...');
    return false;
  }
}

async function checkPaymentStatus() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
    userDataDir: './chrome-data' // Persist Chrome profile
  });

  try {
    const page = await browser.newPage();

    // Load saved cookies if available
    const hasCookies = await loadCookies(page);

    console.log('[*] Navigating to BC Self-Serve portal...');
    await page.goto('https://myselfserve.gov.bc.ca', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit to see if cookies work
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we're already logged in or need to login
    const currentUrl = page.url();
    console.log(`[*] Current URL: ${currentUrl}`);

    if (currentUrl.includes('logon') || currentUrl.includes('login')) {
      console.log('[*] Login required...');

      const loginSuccess = await attemptLogin(page);

      if (!loginSuccess) {
        console.log('[*] Waiting for manual login (5 minutes timeout)...');
        await page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 300000
        });
      } else {
        // Wait for navigation after automated login
        try {
          await page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: 30000
          });
        } catch (e) {
          console.log('[!] Navigation timeout, checking current page...');
        }
      }

      // Save cookies after successful login
      await saveCookies(page);
      console.log('[+] Login successful!');
    } else {
      console.log('[+] Already logged in (cookies worked!)');
    }

    // Wait a bit for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('[*] Checking for payment information...');

    // Look for payment-related information
    const paymentInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const html = document.body.innerHTML;

      // Look for common payment indicators
      const paymentKeywords = ['payment', 'paid', 'pending', 'processed', 'deposit', 'amount', 'balance', 'invoice', 'status'];
      const foundInfo = [];

      paymentKeywords.forEach(keyword => {
        const regex = new RegExp(`.{0,100}${keyword}.{0,100}`, 'gi');
        const matches = body.match(regex);
        if (matches) {
          foundInfo.push(...matches);
        }
      });

      // Remove duplicates
      const uniqueInfo = [...new Set(foundInfo)];

      return {
        found: uniqueInfo,
        pageTitle: document.title,
        url: window.location.href
      };
    });

    console.log('\n[*] Payment Status Information:');
    console.log('═══════════════════════════════════════');
    console.log(`Page: ${paymentInfo.pageTitle}`);
    console.log(`URL: ${paymentInfo.url}`);
    console.log('\n[*] Found payment-related text:');

    if (paymentInfo.found.length > 0) {
      paymentInfo.found.slice(0, 20).forEach((info, index) => {
        console.log(`${index + 1}. ${info.trim()}`);
      });
      if (paymentInfo.found.length > 20) {
        console.log(`... and ${paymentInfo.found.length - 20} more matches`);
      }
    } else {
      console.log('[!] No payment information found automatically.');
      console.log('The browser window will remain open for manual inspection.');
    }

    // Take a screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `payment-status-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n[*] Screenshot saved as ${screenshotPath}`);

    console.log('\n[*] Browser will remain open for manual inspection.');
    console.log('Press Ctrl+C to close when done.');

    // Keep browser open for manual inspection
    await new Promise(() => {});

  } catch (error) {
    console.error('[!] Error:', error.message);

    try {
      const page = (await browser.pages())[0];
      await page.screenshot({ path: 'error-screenshot.png' });
      console.log('[*] Error screenshot saved as error-screenshot.png');
    } catch (screenshotError) {
      // Ignore screenshot errors
    }
  } finally {
    // Browser will be closed by Ctrl+C
  }
}

// Run the scraper
checkPaymentStatus();
