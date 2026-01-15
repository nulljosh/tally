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

    console.log('[*] Looking for Messages/Notifications section...');

    // Try to find and click on Messages or Notifications link
    const messagesClicked = await page.evaluate(() => {
      // Look for various possible link texts
      const possibleTexts = [
        'messages',
        'notifications',
        'inbox',
        'alerts',
        'my messages',
        'view messages'
      ];

      const links = Array.from(document.querySelectorAll('a, button'));

      for (const link of links) {
        const text = link.innerText?.toLowerCase() || '';
        const href = link.getAttribute('href')?.toLowerCase() || '';

        for (const searchText of possibleTexts) {
          if (text.includes(searchText) || href.includes(searchText)) {
            console.log(`Found link: ${link.innerText || link.textContent}`);
            link.click();
            return true;
          }
        }
      }

      return false;
    });

    if (messagesClicked) {
      console.log('[+] Clicked on Messages/Notifications link, waiting for page load...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log('[*] No Messages/Notifications link found, checking current page...');
    }

    console.log('[*] Extracting notifications and payment information...');

    // Look for notifications and payment-related information
    const notificationInfo = await page.evaluate(() => {
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
        url: window.location.href
      };
    });

    console.log('\n[*] ═══════════════════════════════════════');
    console.log(`[*] Page: ${notificationInfo.pageTitle}`);
    console.log(`[*] URL: ${notificationInfo.url}`);
    console.log('[*] ═══════════════════════════════════════');

    if (notificationInfo.notifications.length > 0) {
      console.log('\n[+] NOTIFICATIONS FOUND:');
      notificationInfo.notifications.forEach((notification, index) => {
        console.log(`\n[${index + 1}] ${notification}`);
      });
    } else {
      console.log('\n[*] No structured notifications found.');
    }

    console.log('\n[*] Payment-related text:');
    if (notificationInfo.found.length > 0) {
      notificationInfo.found.slice(0, 20).forEach((info, index) => {
        console.log(`${index + 1}. ${info.trim()}`);
      });
      if (notificationInfo.found.length > 20) {
        console.log(`... and ${notificationInfo.found.length - 20} more matches`);
      }
    } else {
      console.log('[*] No payment information found automatically.');
      console.log('[*] The browser window will remain open for manual inspection.');
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
      page: notificationInfo.pageTitle,
      url: notificationInfo.url,
      notifications: notificationInfo.notifications,
      paymentInfo: notificationInfo.found,
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
