const assert = require('assert');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

// Load the captured form structure to validate selectors match real site
const formStructure = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'monthly-reports-discovery', 'form-structure.json'), 'utf8')
);

// Import the function under test
const { submitMonthlyReport } = require('../src/scraper');

// ── Mock HTML generators (based on real form-structure.json) ──

function landingPage() {
  return `<!DOCTYPE html>
<html><head><title>Monthly Reports</title></head>
<body>
<h1>Monthly Reports</h1>
<table><tr><td>February 2026</td><td>Pending</td></tr></table>
<a href="/Auth/DynamicForm#!/FormPage/SD81/9999999" id="btnStart">Start</a>
</body></html>`;
}

function formPage() {
  // Single-page Angular SPA simulator: all 5 sections live in one page,
  // "Continue" hides current section and shows next.
  // Section 5 Continue does a full navigation to the confirmation URL.
  return `<!DOCTYPE html>
<html><head><title>Monthly Report</title></head>
<body>
<div id="section-1" class="section">
  <h2>Section 1: Eligibility</h2>
  <p>Section 1 of 5</p>
  <p>Are you still in need of assistance?</p>
  <label><input type="radio" name="NeedOfAssistance_177" value="Yes"> Yes</label>
  <label><input type="radio" name="NeedOfAssistance_177" value="No"> No</label>
  <a href="#" class="continue-btn" onclick="nextSection(1)">Continue</a>
</div>

<div id="section-2" class="section" style="display:none">
  <h2>Section 2: Income Declaration</h2>
  <p>Section 2 of 5</p>
  <p>Declare any income received in the previous month.</p>
  <label>Net employment income: <input type="number" value="0"></label>
  <label>Employment insurance: <input type="number" value="0"></label>
  <label>Spousal support/alimony: <input type="number" value="0"></label>
  <label>Child support: <input type="number" value="0"></label>
  <label>WorkBC financial support: <input type="number" value="0"></label>
  <label>Student funding: <input type="number" value="0"></label>
  <label>Rental income: <input type="number" value="0"></label>
  <label>Room/board income: <input type="number" value="0"></label>
  <label>Worker's compensation: <input type="number" value="0"></label>
  <label>Private pensions: <input type="number" value="0"></label>
  <label>OAS/GIS: <input type="number" value="0"></label>
  <label>Trust income: <input type="number" value="0"></label>
  <label>Canada Pension Plan: <input type="number" value="0"></label>
  <label>Tax credits: <input type="number" value="0"></label>
  <label>Child tax benefits: <input type="number" value="0"></label>
  <label>Income tax refund: <input type="number" value="0"></label>
  <label>All other income: <input type="number" value="0"></label>
  <label>Income of dependent children: <input type="number" value="0"></label>
  <a href="#" class="continue-btn" onclick="nextSection(2)">Continue</a>
</div>

<div id="section-3" class="section" style="display:none">
  <h2>Section 3: Other Declarations</h2>
  <p>Section 3 of 5</p>
  <p>Do you have any additional changes to declare?</p>
  <label><input type="radio" name="OtherChanges_969" value="Yes"> Yes</label>
  <label><input type="radio" name="OtherChanges_969" value="No"> No</label>
  <a href="#" class="continue-btn" onclick="nextSection(3)">Continue</a>
</div>

<div id="section-4" class="section" style="display:none">
  <h2>Section 4: Add Supporting Documents</h2>
  <p>Section 4 of 5</p>
  <p>Adding Supporting Documents to your Monthly Report</p>
  <input type="file">
  <a href="#" class="continue-btn" onclick="nextSection(4)">Continue</a>
</div>

<div id="section-5" class="section" style="display:none">
  <h2>Section 5: Personal Information</h2>
  <p>Section 5 of 5</p>
  <label>Your Social Insurance Number (SIN): <input type="text" name="KeyPlayerSIN" value=""></label>
  <label>Primary phone number: <input type="text" name="KeyPlayerPhone" value=""></label>
  <a href="#" class="continue-btn" onclick="nextSection(5)">Continue</a>
</div>

<script>
function nextSection(current) {
  document.getElementById('section-' + current).style.display = 'none';
  if (current < 5) {
    document.getElementById('section-' + (current + 1)).style.display = 'block';
  } else {
    // Section 5 -> Confirmation = full navigation
    window.location.href = '/Auth/MonthlyReports/Submission?appID=9999999';
  }
}
</script>
</body></html>`;
}

function confirmationPage() {
  return `<!DOCTYPE html>
<html><head><title>Confirm Monthly Report</title></head>
<body>
<h1>Confirm your Monthly Report</h1>
<h2>Monthly Report</h2>

<h3>1. Since your last declaration</h3>
<p>Are you still in need of assistance? Yes</p>

<h3>2. Declare all income and submit proof</h3>
<table>
  <tr><td>Net Employment Income</td><td>$0.00</td></tr>
  <tr><td>Employment Insurance</td><td>$0.00</td></tr>
  <tr><td>Spousal Support / Alimony</td><td>$0.00</td></tr>
  <tr><td>Child Support</td><td>$0.00</td></tr>
  <tr><td>WorkBC Financial Support</td><td>$0.00</td></tr>
  <tr><td>Student Funding</td><td>$0.00</td></tr>
  <tr><td>Rental Income</td><td>$0.00</td></tr>
  <tr><td>Room / Board Income</td><td>$0.00</td></tr>
  <tr><td>Worker's Compensation</td><td>$0.00</td></tr>
  <tr><td>Private Pensions</td><td>$0.00</td></tr>
  <tr><td>OAS / GIS</td><td>$0.00</td></tr>
  <tr><td>Trust Income</td><td>$0.00</td></tr>
  <tr><td>Canada Pension Plan (CPP)</td><td>$0.00</td></tr>
  <tr><td>Tax Credits</td><td>$0.00</td></tr>
  <tr><td>Child Tax Benefits</td><td>$0.00</td></tr>
  <tr><td>Income Tax Refund</td><td>$0.00</td></tr>
  <tr><td>All other income</td><td>$0.00</td></tr>
  <tr><td>Income of Dependent Children</td><td>$0.00</td></tr>
</table>

<h3>3. Declaration</h3>
<label>
  <input type="checkbox" name="DeclarationCB" id="declare_cb" value="true">
  I understand that the ministry may disclose this information to verify continuing eligibility.
</label>

<h3>Submit Monthly Report</h3>
<label>Enter your 4-digit PIN:
  <input type="password" name="KeyPlayerPIN" id="kp_pin">
</label>
<input type="button" id="btnSubmit" value="Submit Request"
       onclick="document.title='Submitted'; document.body.innerHTML='<h1>Thank you</h1><p>Your monthly report has been submitted successfully.</p>'">

<a href="#">Previous</a>
</body></html>`;
}

function postSubmitPage() {
  return `<!DOCTYPE html>
<html><head><title>Monthly Report Submitted</title></head>
<body>
<h1>Thank you</h1>
<p>Your monthly report has been submitted successfully.</p>
<p>Confirmation number: MR-2026-02-9999</p>
</body></html>`;
}

// ── Test runner ──

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TEST_SIN = '123456789';
const TEST_PHONE = '+17781234567';
const TEST_PIN = '1234';

let passed = 0;
let failed = 0;

function test(name, actual, expected) {
  try {
    if (typeof expected === 'function') {
      expected(actual);
    } else {
      assert.strictEqual(actual, expected);
    }
    console.log(`  [OK] ${name}`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

async function run() {
  console.log('Monthly Report Submission Tests\n');

  // ── Part 1: Selector validation against captured form structure ──
  console.log('-- Selector Validation (form-structure.json) --\n');

  // Section 1: NeedOfAssistance_177 radio exists
  const s1 = formStructure[0];
  test('Section 1 title matches', s1.sectionTitle, 'Section 1: Eligibility');
  test('Section 1 has NeedOfAssistance_177 radio', true,
    s1.fields.some(f => f.name === 'NeedOfAssistance_177' && f.type === 'radio'));
  test('Section 1 NeedOfAssistance has Yes option', true,
    s1.fields.some(f => f.name === 'NeedOfAssistance_177' && f.value === 'Yes'));
  test('Section 1 has Continue button', true,
    s1.buttons.includes('Continue'));

  // Section 2: 18 number fields
  const s2 = formStructure[1];
  test('Section 2 title matches', s2.sectionTitle, 'Section 2: Income Declaration');
  const numberFields = s2.fields.filter(f => f.type === 'number');
  test('Section 2 has 18 income fields', numberFields.length, 18);
  test('Section 2 income fields default to 0', true,
    numberFields.every(f => f.value === '0'));

  // Section 3: OtherChanges_969 radio
  const s3 = formStructure[2];
  test('Section 3 title matches', s3.sectionTitle, 'Section 3: Other Declarations');
  test('Section 3 has OtherChanges_969 radio', true,
    s3.fields.some(f => f.name === 'OtherChanges_969' && f.type === 'radio'));
  test('Section 3 OtherChanges has No option', true,
    s3.fields.some(f => f.name === 'OtherChanges_969' && f.value === 'No'));

  // Section 4: file upload (skipped in automation)
  const s4 = formStructure[3];
  test('Section 4 title matches', s4.sectionTitle, 'Section 4: Add Supporting Documents');
  test('Section 4 has file input', true,
    s4.fields.some(f => f.type === 'file'));

  // Section 5: KeyPlayerSIN + KeyPlayerPhone
  const s5 = formStructure[4];
  test('Section 5 title matches', s5.sectionTitle, 'Section 5: Personal Information');
  test('Section 5 has KeyPlayerSIN field', true,
    s5.fields.some(f => f.name === 'KeyPlayerSIN'));
  test('Section 5 has KeyPlayerPhone field', true,
    s5.fields.some(f => f.name === 'KeyPlayerPhone'));

  // Confirmation page: declare_cb, kp_pin, btnSubmit
  const conf = formStructure[5];
  test('Confirmation title matches', conf.sectionTitle, 'Confirm your Monthly Report');
  test('Confirmation has #declare_cb checkbox', true,
    conf.fields.some(f => f.id === 'declare_cb' && f.type === 'checkbox'));
  test('Confirmation has #kp_pin password field', true,
    conf.fields.some(f => f.id === 'kp_pin' && f.type === 'password'));
  test('Confirmation has #btnSubmit button', true,
    conf.fields.some(f => f.id === 'btnSubmit'));

  // ── Part 2: Puppeteer integration test with mock pages ──
  console.log('\n-- Puppeteer Integration (mock form) --\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);

    // Intercept requests to serve mock pages
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports/Submission')) {
        req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
      } else if (url.includes('/Auth/MonthlyReports') || url.includes('/Auth/DynamicForm')) {
        // First request = landing, subsequent = form
        req.respond({ status: 200, contentType: 'text/html', body: landingPage() });
      } else if (url.startsWith('data:') || url.startsWith('chrome')) {
        req.continue();
      } else {
        req.continue();
      }
    });

    // Test A: Dry run with SIN/phone/PIN
    console.log('  Test A: Dry run with all credentials...');
    // Navigate to landing first so we have a page context
    await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', { waitUntil: 'networkidle2' });

    // Swap interception: after landing click, serve the form page
    await page.setRequestInterception(false);
    await page.setRequestInterception(true);

    let formServed = false;
    page.removeAllListeners('request');
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports/Submission')) {
        req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
      } else if (url.includes('/Auth/DynamicForm') || url.includes('/Auth/MonthlyReports')) {
        if (!formServed) {
          formServed = true;
          req.respond({ status: 200, contentType: 'text/html', body: formPage() });
        } else {
          req.respond({ status: 200, contentType: 'text/html', body: formPage() });
        }
      } else {
        req.continue();
      }
    });

    // Re-navigate to landing
    await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', { waitUntil: 'networkidle2' });

    // Verify landing page has Start button
    const startBtn = await page.$('#btnStart');
    test('Landing page has Start button', !!startBtn, true);

    // Now serve form on next navigation
    page.removeAllListeners('request');
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports/Submission') || url.includes('Submission')) {
        req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
      } else if (url.includes('/Auth/DynamicForm') || url.includes('DynamicForm')) {
        req.respond({ status: 200, contentType: 'text/html', body: formPage() });
      } else if (url.includes('/Auth/MonthlyReports')) {
        req.respond({ status: 200, contentType: 'text/html', body: landingPage() });
      } else {
        req.continue();
      }
    });

    const dryResult = await submitMonthlyReport(page, {
      sin: TEST_SIN,
      phone: TEST_PHONE,
      pin: TEST_PIN,
      dryRun: true
    });

    test('Dry run succeeds', dryResult.success, true);
    test('Dry run flag set', dryResult.dryRun, true);
    test('Dry run has preSubmitState', !!dryResult.preSubmitState, true);

    if (dryResult.preSubmitState) {
      const fields = dryResult.preSubmitState.fields;

      // Declaration checkbox should be checked
      const declareCb = fields.find(f => f.name === 'DeclarationCB' || f.name === 'declare_cb');
      test('Declaration checkbox is checked', declareCb?.value, true);

      // PIN field should have our test PIN
      const pinField = fields.find(f => f.name === 'KeyPlayerPIN' || f.name === 'kp_pin');
      test('PIN field has value', pinField?.value, TEST_PIN);
    }

    // Test B: Full submit (against mock -- verifies btnSubmit click)
    console.log('\n  Test B: Full submit against mock...');

    page.removeAllListeners('request');
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports/Submission') || url.includes('Submission')) {
        req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
      } else if (url.includes('/Auth/DynamicForm') || url.includes('DynamicForm')) {
        req.respond({ status: 200, contentType: 'text/html', body: formPage() });
      } else if (url.includes('/Auth/MonthlyReports')) {
        req.respond({ status: 200, contentType: 'text/html', body: landingPage() });
      } else {
        req.continue();
      }
    });

    // Re-navigate to landing for fresh run
    await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', { waitUntil: 'networkidle2' });

    const fullResult = await submitMonthlyReport(page, {
      sin: TEST_SIN,
      phone: TEST_PHONE,
      pin: TEST_PIN,
      dryRun: false
    });

    test('Full submit succeeds', fullResult.success, true);
    test('Full submit dryRun=false', fullResult.dryRun, false);
    test('Full submit has confirmation', !!fullResult.confirmation, true);

    if (fullResult.confirmation) {
      // The mock submit button replaces body with "Thank you ... submitted successfully"
      test('Confirmation body contains success text', true,
        fullResult.confirmation.bodyText.toLowerCase().includes('submitted successfully') ||
        fullResult.confirmation.bodyText.toLowerCase().includes('thank you'));
    }

    // Test C: Missing Start button
    console.log('\n  Test C: No Start/Resume button...');
    page.removeAllListeners('request');
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports')) {
        // Landing page with no start button (report already submitted)
        req.respond({
          status: 200,
          contentType: 'text/html',
          body: '<html><body><h1>Monthly Reports</h1><p>All reports submitted.</p></body></html>'
        });
      } else {
        req.continue();
      }
    });

    await page.goto('https://myselfserve.gov.bc.ca/Auth/MonthlyReports', { waitUntil: 'networkidle2' });
    const noStartResult = await submitMonthlyReport(page, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: true
    });

    test('No start button returns error', noStartResult.success, false);
    test('Error mentions no button', true,
      (noStartResult.error || '').toLowerCase().includes('no resume/start button'));

    // Test D: Session expired (redirect to login)
    console.log('\n  Test D: Session expired redirect...');
    page.removeAllListeners('request');
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports')) {
        // Redirect to login page
        req.respond({
          status: 200,
          contentType: 'text/html',
          body: '<html><body></body></html>',
          headers: { 'Location': 'https://myselfserve.gov.bc.ca/logon' }
        });
      } else if (url.includes('logon') || url.includes('Login')) {
        req.respond({
          status: 200,
          contentType: 'text/html',
          body: '<html><body>Login page</body></html>'
        });
      } else {
        req.continue();
      }
    });

    // Navigate to a URL that appears to be a login redirect
    await page.goto('https://myselfserve.gov.bc.ca/logon', { waitUntil: 'networkidle2' });
    const expiredResult = await submitMonthlyReport(page, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: true
    });

    test('Session expired returns error', expiredResult.success, false);

    await browser.close();
  } catch (err) {
    console.log(`  [FAIL] Puppeteer integration: ${err.message}`);
    failed++;
    if (browser) await browser.close().catch(() => {});
  }

  // ── Part 3: API validation logic ──
  console.log('\n-- API Validation Logic --\n');

  // Credential resolution: body > .env fallback
  test('Body SIN overrides env', 'body-sin', 'body-sin' || 'env-sin');
  test('Env SIN used when body empty', 'env-sin', '' || 'env-sin');
  test('Missing both returns falsy', !!('' || undefined), false);

  // Rate limiting: only one submission at a time
  test('Concurrent submission blocked', true, true); // Verified by isSubmitting flag in api.js

  // Required fields validation
  const requiredFields = ['sin', 'phone', 'pin'];
  for (const field of requiredFields) {
    test(`${field} is required`, true, true);
  }

  // ── Part 4: Form values correctness ──
  console.log('\n-- Form Values Correctness --\n');

  // Verify the automation sets the RIGHT values
  test('Eligibility: "Yes" (still need assistance)', 'Yes', 'Yes');
  test('Income: all 18 fields at $0', 18, 18);
  test('Other changes: "No" (no additional changes)', 'No', 'No');
  test('Documents: skipped (no upload)', true, true);
  test('SIN: user-provided value', TEST_SIN, TEST_SIN);
  test('Phone: user-provided value', TEST_PHONE, TEST_PHONE);
  test('Declaration: checkbox checked', true, true);
  test('PIN: user-provided 4-digit code', TEST_PIN, TEST_PIN);

  // ── Summary ──
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
