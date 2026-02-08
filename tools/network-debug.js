const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function loadCookies(page) {
  try {
    const cookiesString = await fs.readFile(COOKIES_PATH, 'utf8');
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    console.log('[*] Loaded saved cookies');
    return true;
  } catch (error) {
    console.log('[*] No saved cookies found');
    return false;
  }
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[*] Cookies saved');
  } catch (error) {
    console.log('[!] Failed to save cookies:', error.message);
  }
}

async function attemptLogin(page) {
  const username = process.env.BCEID_USERNAME;
  const password = process.env.BCEID_PASSWORD;

  if (!username || !password) {
    console.log('[!] No credentials in .env file');
    return false;
  }

  try {
    console.log('[*] Looking for Sign in button...');

    // Click "Sign in" button on homepage
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

      console.log('[*] Submitting login...');

      const submitButton = await page.$('input[name="btnSubmit"], button[type="submit"], input[type="submit"]');
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
          submitButton.click()
        ]);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const finalUrl = page.url();
        if (finalUrl.includes('logon') || finalUrl.includes('login')) {
          console.log('[!] Login failed');
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

async function debugNetworkTraffic() {
  console.log('═══════════════════════════════════════');
  console.log('   BC SELF-SERVE NETWORK TRAFFIC DEBUG  ');
  console.log('═══════════════════════════════════════\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
    userDataDir: './chrome-data'
  });

  const page = await browser.newPage();

  // Track all network requests
  const networkLog = [];
  const apiCalls = [];

  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();

    // Log all requests
    networkLog.push({
      type: 'request',
      method,
      url,
      headers,
      postData,
      timestamp: new Date().toISOString()
    });

    // Highlight potential API calls
    if (
      url.includes('myselfserve.gov.bc.ca') &&
      (method !== 'GET' || url.includes('/api/') || url.includes('/Auth/'))
    ) {
      console.log(`\n[→] ${method} ${url}`);

      if (headers.authorization) {
        console.log(`    Auth: ${headers.authorization.substring(0, 30)}...`);
      }

      if (headers.cookie) {
        console.log(`    Cookies: ${headers.cookie.split(';').length} cookies sent`);
      }

      if (postData) {
        console.log(`    POST Data: ${postData.substring(0, 100)}...`);
      }

      apiCalls.push({
        method,
        url,
        headers,
        postData,
        timestamp: new Date().toISOString()
      });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    const status = response.status();
    const headers = response.headers();

    networkLog.push({
      type: 'response',
      url,
      status,
      headers,
      timestamp: new Date().toISOString()
    });

    // Log interesting responses
    if (
      url.includes('myselfserve.gov.bc.ca') &&
      (url.includes('/Auth/') || url.includes('/api/'))
    ) {
      console.log(`[←] ${status} ${url}`);

      // Try to capture response body for API calls
      try {
        const contentType = headers['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text();
          console.log(`    Response: ${body.substring(0, 200)}...`);

          // Add to API calls log
          const matchingCall = apiCalls.find(c => c.url === url && !c.response);
          if (matchingCall) {
            matchingCall.response = {
              status,
              headers,
              body: body.substring(0, 1000)
            };
          }
        }
      } catch (e) {
        // Ignore errors reading response body
      }

      // Check for Set-Cookie headers
      if (headers['set-cookie']) {
        console.log(`    Sets cookies: ${headers['set-cookie']}`);
      }
    }
  });

  try {
    // Load saved cookies
    await loadCookies(page);

    console.log('[*] Navigating to homepage...');
    await page.goto('https://myselfserve.gov.bc.ca', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try accessing protected page
    console.log('\n[*] Attempting to access /Auth page...');
    await page.goto('https://myselfserve.gov.bc.ca/Auth', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    let currentUrl = page.url();

    // If kicked to login, do the login
    if (currentUrl.includes('logon') || currentUrl.includes('login')) {
      console.log('\n[*] Need to login, starting login process...\n');

      let loginSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[*] Login attempt ${attempt}/3...`);
        loginSuccess = await attemptLogin(page);

        if (loginSuccess) {
          await saveCookies(page);
          break;
        }

        if (attempt < 3) {
          console.log('[!] Retrying...');
          await page.goto('https://myselfserve.gov.bc.ca', {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!loginSuccess) {
        throw new Error('Login failed after 3 attempts');
      }

      console.log('\n[*] Login complete! Now trying to access protected pages...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log('[+] Already authenticated!\n');
    }

    // Now try each section and watch the network traffic
    const sections = [
      'https://myselfserve.gov.bc.ca/Auth',
      'https://myselfserve.gov.bc.ca/Auth/Messages',
      'https://myselfserve.gov.bc.ca/Auth/PaymentInfo',
      'https://myselfserve.gov.bc.ca/Auth/ServiceRequests'
    ];

    for (const sectionUrl of sections) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[*] Navigating to: ${sectionUrl}`);
      console.log('='.repeat(60));

      await page.goto(sectionUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      currentUrl = page.url();
      if (currentUrl.includes('logon') || currentUrl.includes('login')) {
        console.log('[!] [FAIL] Got kicked back to login!');
      } else {
        console.log('[+] [OK] Page loaded successfully!');

        // Check what's on the page
        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hasContent: document.body.innerText.length,
            // Check for form tokens or hidden fields
            hiddenInputs: Array.from(document.querySelectorAll('input[type="hidden"]')).map(el => ({
              name: el.name,
              value: el.value?.substring(0, 50)
            })),
            // Check localStorage and sessionStorage
            localStorage: { ...localStorage },
            sessionStorage: { ...sessionStorage }
          };
        });

        console.log(`    Title: ${pageInfo.title}`);
        console.log(`    Content length: ${pageInfo.hasContent} chars`);

        if (pageInfo.hiddenInputs.length > 0) {
          console.log(`    Hidden inputs found:`);
          pageInfo.hiddenInputs.forEach(input => {
            console.log(`      - ${input.name}: ${input.value}`);
          });
        }

        if (Object.keys(pageInfo.localStorage).length > 0) {
          console.log(`    localStorage:`, pageInfo.localStorage);
        }

        if (Object.keys(pageInfo.sessionStorage).length > 0) {
          console.log(`    sessionStorage:`, pageInfo.sessionStorage);
        }
      }
    }

    // Save detailed network log
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(
      `network-log-${timestamp}.json`,
      JSON.stringify({ networkLog, apiCalls }, null, 2)
    );
    console.log(`\n[*] Full network log saved to network-log-${timestamp}.json`);

    // Save API calls summary
    if (apiCalls.length > 0) {
      console.log('\n═══════════════════════════════════════');
      console.log('        API CALLS SUMMARY');
      console.log('═══════════════════════════════════════\n');

      apiCalls.forEach((call, i) => {
        console.log(`${i + 1}. ${call.method} ${call.url}`);
        if (call.response) {
          console.log(`   → Status: ${call.response.status}`);
        }
      });

      await fs.writeFile(
        `api-calls-${timestamp}.json`,
        JSON.stringify(apiCalls, null, 2)
      );
      console.log(`\n[*] API calls saved to api-calls-${timestamp}.json`);
    }

    console.log('\n[*] Keeping browser open for manual inspection...');
    console.log('Press Ctrl+C when done.');
    await new Promise(() => {});

  } catch (error) {
    console.error('[!] Error:', error.message);
    await browser.close();
    process.exit(1);
  }
}

// Run
debugNetworkTraffic().catch(console.error);
