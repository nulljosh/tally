const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[*] Cookies saved for future use');
  } catch (error) {
    console.log('[!] Failed to save cookies:', error.message);
  }
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
    const currentUrl = page.url();
    console.log(`[*] Attempting automated login to: ${currentUrl}`);
    console.log(`[*] Username: ${username}`);

    // First, click the "Sign in" button on the homepage if present
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
      console.log('[*] Clicked Sign in button, waiting for login form...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Wait for username field on the actual BCeID login page
    await page.waitForSelector('input[name="user"], input[id="user"]', {
      timeout: 10000
    });

    // Fill in credentials - BC login uses 'user' and 'password' fields
    const usernameField = await page.$('input[name="user"], input[id="user"]');
    const passwordField = await page.$('input[name="password"], input[id="password"]');

    if (usernameField && passwordField) {
      console.log('[*] Filling in credentials...');

      // Clear and fill username
      await usernameField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await usernameField.evaluate(el => el.value = '');
      await usernameField.type(username, { delay: 50 });

      // Clear and fill password
      await passwordField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await passwordField.evaluate(el => el.value = '');
      await passwordField.type(password, { delay: 50 });

      console.log('[*] Submitting login form...');

      // Submit the form and wait for navigation
      const submitButton = await page.$('input[name="btnSubmit"], button[type="submit"], input[type="submit"]');
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
          submitButton.click()
        ]);

        console.log('[*] Form submitted, checking result...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if we're still on login page
        const finalUrl = page.url();
        if (finalUrl.includes('logon') || finalUrl.includes('login')) {
          // Check for error messages on the page
          const errorMessage = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const errorPatterns = ['error', 'invalid', 'incorrect', 'failed'];
            for (const pattern of errorPatterns) {
              const regex = new RegExp(`.{0,100}${pattern}.{0,100}`, 'i');
              const match = bodyText.match(regex);
              if (match) return match[0];
            }
            return null;
          });

          if (errorMessage) {
            console.log(`[!] Login error: ${errorMessage.trim()}`);
          } else {
            console.log('[!] Still on login page - credentials may be incorrect');
          }
          return false;
        }

        console.log('[+] Login successful!');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.log(`[!] Automated login failed: ${error.message}`);
    return false;
  }
}

async function checkPaymentStatus(options = {}) {
  const { headless = false, keepOpen = false } = options;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: headless,
      defaultViewport: headless ? { width: 1920, height: 1080 } : null,
      args: headless ? [] : ['--start-maximized'],
      userDataDir: './chrome-data'
    });
  } catch (error) {
    if (error.message.includes('already running')) {
      console.error('[!] Browser is already running. Please close existing instance or use a different profile.');
      console.error('[!] Run: pkill -f "node scraper.js" to kill existing processes');
      process.exit(1);
    }
    throw error;
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[*] Shutting down gracefully...');
    if (browser) {
      await browser.close();
    }
    process.exit(0);
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

    // Check if we're already logged in by trying to access an auth-required page
    const currentUrl = page.url();
    console.log(`[*] Current URL: ${currentUrl}`);

    // Try to access a protected page to verify authentication
    console.log('[*] Verifying authentication...');
    await page.goto('https://myselfserve.gov.bc.ca/Auth', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const authUrl = page.url();

    if (authUrl.includes('logon') || authUrl.includes('login')) {
      console.log('[*] Login required...');

      // Retry login up to 5 times (BC gov site is flaky)
      let loginSuccess = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        console.log(`[*] Login attempt ${attempt}/5...`);

        loginSuccess = await attemptLogin(page);

        if (loginSuccess) {
          break;
        }

        if (attempt < 5) {
          console.log('[!] Login failed, retrying...');
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Go back to login page for retry
          await page.goto('https://myselfserve.gov.bc.ca', {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!loginSuccess) {
        throw new Error('Login automation failed after 5 attempts - form selectors or logic may need adjustment');
      }

      // Save cookies after successful login
      await saveCookies(page);
      console.log('[+] Login successful! Cookies saved.');

      // Wait a bit to ensure session is fully established
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify session is actually valid by checking current page
      const cookies = await page.cookies();
      console.log(`[*] Session has ${cookies.length} cookies`);
    } else {
      console.log('[+] Already authenticated!');
    }

    // Check multiple sections: Notifications, Messages, Payment Info, Service Requests
    const sections = [
      { name: 'Notifications', url: 'https://myselfserve.gov.bc.ca/Auth' },
      { name: 'Messages', url: 'https://myselfserve.gov.bc.ca/Auth/Messages' },
      { name: 'Payment Info', url: 'https://myselfserve.gov.bc.ca/Auth/PaymentInfo' },
      { name: 'Service Requests', url: 'https://myselfserve.gov.bc.ca/Auth/ServiceRequests' }
    ];

    const allResults = {};

    for (const section of sections) {
      console.log(`\n[*] Checking ${section.name}...`);

      try {
        await page.goto(section.url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if we got redirected to login
        const currentUrl = page.url();
        if (currentUrl.includes('logon') || currentUrl.includes('login')) {
          console.log(`[!] Session expired for ${section.name}, need to re-authenticate`);
          allResults[section.name] = { error: 'Session expired - authentication required' };
          continue;
        }

        console.log(`[+] ${section.name} page loaded!`);

        // Extract data from this section
        const sectionData = await page.evaluate(() => {
      const body = document.body.innerText;
      const html = document.body.innerHTML;

      // Look for notification elements
      const notifications = [];

      // Look for list items (notifications are in <li> elements)
      const listItems = document.querySelectorAll('li');
      listItems.forEach(li => {
        const text = li.innerText?.trim();
        // Filter out navigation items and only get substantial content
        if (text && text.length > 10 && !text.toLowerCase().includes('menu')) {
          notifications.push(text);
        }
      });

      // Also check common notification selectors
      const notificationSelectors = [
        '.notification',
        '.alert',
        '.message',
        '[role="alert"]',
        '.notice',
        '#notifications',
        '[class*="notification"]',
        '[class*="message"]'
      ];

      notificationSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.innerText.trim();
          if (text && text.length > 0) {
            notifications.push(text);
          }
        });
      });

      // Look for common payment and notification keywords
      const keywords = ['payment', 'paid', 'pending', 'processed', 'deposit', 'amount', 'balance', 'invoice', 'status', 'notification', 'message', 'alert'];
      const foundInfo = [];

      keywords.forEach(keyword => {
        const regex = new RegExp(`.{0,150}${keyword}.{0,150}`, 'gi');
        const matches = body.match(regex);
        if (matches) {
          foundInfo.push(...matches);
        }
      });

      // Remove duplicates
      const uniqueInfo = [...new Set(foundInfo)];
      const uniqueNotifications = [...new Set(notifications)];

          return {
            notifications: uniqueNotifications,
            found: uniqueInfo,
            pageTitle: document.title,
            url: window.location.href,
            bodyText: body
          };
        });

        allResults[section.name] = sectionData;

        console.log(`[+] Found ${sectionData.notifications.length} items from ${section.name}`);

      } catch (error) {
        console.log(`[!] Error checking ${section.name}: ${error.message}`);
        allResults[section.name] = { error: error.message };
      }
    }

    // Display results summary
    console.log('\n');
    console.log('═══════════════════════════════════════');
    console.log('         SCRAPER RESULTS SUMMARY        ');
    console.log('═══════════════════════════════════════\n');

    if (allResults.Notifications) {
      const notifs = allResults.Notifications.notifications || [];
      if (notifs.length > 0) {
        console.log('[+] NOTIFICATIONS:');
        notifs.slice(0, 10).forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
        if (notifs.length > 10) console.log(`  ... and ${notifs.length - 10} more`);
      } else {
        console.log('[*] You have no notifications at this time.');
      }
    }

    if (allResults['Payment Info']) {
      console.log('\n[+] PAYMENT INFO:');
      const payInfo = allResults['Payment Info'].notifications || [];
      if (payInfo.length > 0) {
        payInfo.slice(0, 10).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      } else {
        console.log('  No payment information found.');
      }
    }

    if (allResults.Messages) {
      const msgs = allResults.Messages.notifications || [];
      console.log(`\n[*] MESSAGES: ${msgs.length} items found`);
    }

    if (allResults['Service Requests']) {
      const reqs = allResults['Service Requests'].notifications || [];
      if (reqs.length > 0) {
        console.log('\n[+] SERVICE REQUESTS:');
        reqs.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
      } else {
        console.log('\n[*] No service requests at this time.');
      }
    }

    // Take a screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `payment-status-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n[*] Screenshot saved as ${screenshotPath}`);

    // Prepare result object
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      sections: allResults,
      screenshot: screenshotPath
    };

    // Save to JSON file
    const jsonPath = `results-${timestamp}.json`;
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(`[*] Results saved to ${jsonPath}`);

    if (keepOpen) {
      console.log('\n[*] Browser will remain open for manual inspection.');
      console.log('Press Ctrl+C to close when done.');
      await new Promise(() => {});
    } else {
      console.log('\n[+] Check complete! Closing browser...');
      await browser.close();
    }

    return result;

  } catch (error) {
    console.error('[!] Error:', error.message);

    const errorResult = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    try {
      if (browser) {
        const page = (await browser.pages())[0];
        if (page) {
          await page.screenshot({ path: 'error-screenshot.png' });
          console.log('[*] Error screenshot saved as error-screenshot.png');
          errorResult.screenshot = 'error-screenshot.png';
        }
        if (!keepOpen) {
          await browser.close();
        }
      }
    } catch (screenshotError) {
      // Ignore screenshot errors
    }

    return errorResult;
  }
}

// Export for use as module
module.exports = { checkPaymentStatus };

// Run standalone if not imported
if (require.main === module) {
  checkPaymentStatus({ headless: true, keepOpen: false })
    .then(result => {
      console.log('\n[+] Done! Check the results JSON file for full output.');
      process.exit(0);
    })
    .catch(error => {
      console.error('[!] Fatal error:', error);
      process.exit(1);
    });
}
