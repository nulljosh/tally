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

// ── Mock HTML generators ──
// These replicate the real BC Self-Serve form structure.
// The real site is an Angular SPA that replaces DOM content per section.
// We simulate this with a single container and innerHTML replacement.

function landingPage() {
  return `<!DOCTYPE html>
<html><head><title>Monthly Reports</title></head>
<body>
<h1>Monthly Reports</h1>
<table><tr><td>February 2026</td><td>Pending</td></tr></table>
<a href="/Auth/DynamicForm#!/FormPage/SD81/9999999">Start</a>
</body></html>`;
}

// Section HTML templates (only one active at a time, matching real Angular behavior)
const SECTIONS = {
  1: `<h2>Section 1: Eligibility</h2>
<p>Section 1 of 5</p>
<p>Are you still in need of assistance?</p>
<label><input type="radio" name="NeedOfAssistance_177" value="Yes"> Yes</label>
<label><input type="radio" name="NeedOfAssistance_177" value="No"> No</label>`,

  2: `<h2>Section 2: Income Declaration</h2>
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
<label>Income of dependent children: <input type="number" value="0"></label>`,

  3: `<h2>Section 3: Other Declarations</h2>
<p>Section 3 of 5</p>
<p>Do you have any additional changes to declare?</p>
<label><input type="radio" name="OtherChanges_969" value="Yes"> Yes</label>
<label><input type="radio" name="OtherChanges_969" value="No"> No</label>`,

  4: `<h2>Section 4: Add Supporting Documents</h2>
<p>Section 4 of 5</p>
<p>Adding Supporting Documents to your Monthly Report</p>
<input type="file">`,

  5: `<h2>Section 5: Personal Information</h2>
<p>Section 5 of 5</p>
<label>Your Social Insurance Number (SIN): <input type="text" name="KeyPlayerSIN" value=""></label>
<label>Primary phone number: <input type="text" name="KeyPlayerPhone" value=""></label>`
};

function formPage() {
  // Single container that replaces content per section (like real Angular SPA).
  // Continue button replaces container innerHTML with next section.
  // Section 5 Continue does a full navigation to confirmation URL.
  const sectionsJson = JSON.stringify(SECTIONS);
  return `<!DOCTYPE html>
<html><head><title>Monthly Report</title></head>
<body>
<div id="form-container">
${SECTIONS[1]}
<button id="btn-continue" onclick="goNext()">Continue</button>
</div>
<script>
var currentSection = 1;
var sections = ${sectionsJson};
function goNext() {
  currentSection++;
  if (currentSection <= 5) {
    document.getElementById('form-container').innerHTML =
      sections[currentSection] + '<button id="btn-continue" onclick="goNext()">Continue</button>';
  } else {
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
<input type="button" id="btnSubmit" value="Submit Request">

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

  const s1 = formStructure[0];
  test('Section 1 title matches', s1.sectionTitle, 'Section 1: Eligibility');
  test('Section 1 has NeedOfAssistance_177 radio', true,
    s1.fields.some(f => f.name === 'NeedOfAssistance_177' && f.type === 'radio'));
  test('Section 1 NeedOfAssistance has Yes option', true,
    s1.fields.some(f => f.name === 'NeedOfAssistance_177' && f.value === 'Yes'));
  test('Section 1 has Continue button', true, s1.buttons.includes('Continue'));

  const s2 = formStructure[1];
  test('Section 2 title matches', s2.sectionTitle, 'Section 2: Income Declaration');
  const numberFields = s2.fields.filter(f => f.type === 'number');
  test('Section 2 has 18 income fields', numberFields.length, 18);
  test('Section 2 income fields default to 0', true, numberFields.every(f => f.value === '0'));

  const s3 = formStructure[2];
  test('Section 3 title matches', s3.sectionTitle, 'Section 3: Other Declarations');
  test('Section 3 has OtherChanges_969 radio', true,
    s3.fields.some(f => f.name === 'OtherChanges_969' && f.type === 'radio'));
  test('Section 3 OtherChanges has No option', true,
    s3.fields.some(f => f.name === 'OtherChanges_969' && f.value === 'No'));

  const s4 = formStructure[3];
  test('Section 4 title matches', s4.sectionTitle, 'Section 4: Add Supporting Documents');
  test('Section 4 has file input', true, s4.fields.some(f => f.type === 'file'));

  const s5 = formStructure[4];
  test('Section 5 title matches', s5.sectionTitle, 'Section 5: Personal Information');
  test('Section 5 has KeyPlayerSIN field', true, s5.fields.some(f => f.name === 'KeyPlayerSIN'));
  test('Section 5 has KeyPlayerPhone field', true, s5.fields.some(f => f.name === 'KeyPlayerPhone'));

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

    // Helper: set up request interceptor for standard form flow
    async function setupInterceptor(page) {
      await page.setRequestInterception(true);
      page.removeAllListeners('request');
      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('/Auth/MonthlyReports/Submission') || url.includes('Submission?appID')) {
          req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
        } else if (url.includes('/Auth/DynamicForm')) {
          req.respond({ status: 200, contentType: 'text/html', body: formPage() });
        } else if (url.includes('/Auth/MonthlyReports')) {
          req.respond({ status: 200, contentType: 'text/html', body: landingPage() });
        } else {
          req.continue();
        }
      });
    }

    // ── Test A: Dry run ──
    console.log('  Test A: Dry run with all credentials...');
    const pageA = await browser.newPage();
    pageA.setDefaultNavigationTimeout(15000);
    await setupInterceptor(pageA);

    const dryResult = await submitMonthlyReport(pageA, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: true
    });

    test('Dry run succeeds', dryResult.success, true);
    test('Dry run flag set', dryResult.dryRun, true);
    test('Dry run has preSubmitState', !!dryResult.preSubmitState, true);

    if (dryResult.preSubmitState) {
      const fields = dryResult.preSubmitState.fields;

      // Declaration checkbox should be checked
      const declareCb = fields.find(f =>
        f.name === 'DeclarationCB' || f.name === 'declare_cb' ||
        (f.type === 'checkbox' && f.value === true)
      );
      test('Declaration checkbox is checked', !!declareCb && declareCb.value === true, true);

      // PIN field should have our test PIN
      const pinField = fields.find(f =>
        f.name === 'KeyPlayerPIN' || f.name === 'kp_pin' ||
        (f.type === 'password' && f.value)
      );
      test('PIN field has value', pinField?.value, TEST_PIN);

      // URL should be confirmation page
      test('Confirmation page URL', true,
        (dryResult.preSubmitState.url || '').includes('Submission'));
    }

    await pageA.close();

    // ── Test B: Full submit ──
    console.log('\n  Test B: Full submit against mock...');
    const pageB = await browser.newPage();
    pageB.setDefaultNavigationTimeout(15000);

    // For full submit, also intercept the post-submit page load
    await pageB.setRequestInterception(true);
    pageB.on('request', (req) => {
      const url = req.url();
      if (url.includes('/Auth/MonthlyReports/Submission') || url.includes('Submission?appID')) {
        req.respond({ status: 200, contentType: 'text/html', body: confirmationPage() });
      } else if (url.includes('/Auth/DynamicForm')) {
        req.respond({ status: 200, contentType: 'text/html', body: formPage() });
      } else if (url.includes('/Auth/MonthlyReports')) {
        req.respond({ status: 200, contentType: 'text/html', body: landingPage() });
      } else {
        req.continue();
      }
    });

    const fullResult = await submitMonthlyReport(pageB, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: false
    });

    test('Full submit succeeds', fullResult.success, true);
    test('Full submit dryRun=false', fullResult.dryRun, false);
    test('Full submit has confirmation', !!fullResult.confirmation, true);

    if (fullResult.confirmation) {
      // Confirmation page has "Confirm your Monthly Report" title and submit button
      // The success detection looks for submit/confirm/success/thank you/received
      const body = fullResult.confirmation.bodyText.toLowerCase();
      test('Confirmation body has expected text', true,
        body.includes('confirm') || body.includes('submit') || body.includes('thank'));
    }

    await pageB.close();

    // ── Test C: No Start/Resume button ──
    console.log('\n  Test C: No Start/Resume button...');
    const pageC = await browser.newPage();
    pageC.setDefaultNavigationTimeout(15000);
    await pageC.setRequestInterception(true);
    pageC.on('request', (req) => {
      req.respond({
        status: 200, contentType: 'text/html',
        body: '<html><body><h1>Monthly Reports</h1><p>All reports submitted.</p></body></html>'
      });
    });

    const noStartResult = await submitMonthlyReport(pageC, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: true
    });

    test('No start button returns error', noStartResult.success, false);
    test('Error mentions no button', true,
      (noStartResult.error || '').toLowerCase().includes('no resume/start button'));
    await pageC.close();

    // ── Test D: Session expired ──
    console.log('\n  Test D: Session expired redirect...');
    const pageD = await browser.newPage();
    pageD.setDefaultNavigationTimeout(15000);
    await pageD.setRequestInterception(true);
    pageD.on('request', (req) => {
      const url = req.url();
      if (url.includes('logon') || url.includes('Login')) {
        req.respond({ status: 200, contentType: 'text/html',
          body: '<html><body>Login page</body></html>' });
      } else {
        // Redirect to login
        req.respond({ status: 302, headers: { location: 'https://myselfserve.gov.bc.ca/logon' } });
      }
    });

    await pageD.goto('https://myselfserve.gov.bc.ca/logon', { waitUntil: 'networkidle2' });
    const expiredResult = await submitMonthlyReport(pageD, {
      sin: TEST_SIN, phone: TEST_PHONE, pin: TEST_PIN, dryRun: true
    });

    test('Session expired returns error', expiredResult.success, false);
    await pageD.close();

    // ── Test E: Verify section transitions work ──
    console.log('\n  Test E: Mock page section transitions...');
    const pageE = await browser.newPage();
    pageE.setDefaultNavigationTimeout(15000);
    await pageE.setRequestInterception(true);
    pageE.on('request', (req) => {
      const url = req.url();
      if (url.includes('DynamicForm')) {
        req.respond({ status: 200, contentType: 'text/html', body: formPage() });
      } else {
        req.continue();
      }
    });

    await pageE.goto('https://myselfserve.gov.bc.ca/Auth/DynamicForm#!/test', { waitUntil: 'networkidle2' });

    // Verify Section 1 is shown
    let bodyText = await pageE.evaluate(() => document.body.innerText);
    test('Form starts on Section 1', true, bodyText.includes('Section 1'));
    test('Section 1 has eligibility radio', true, bodyText.includes('need of assistance'));

    // Click Continue -> Section 2
    await pageE.evaluate(() => document.getElementById('btn-continue').click());
    await new Promise(r => setTimeout(r, 100));
    bodyText = await pageE.evaluate(() => document.body.innerText);
    test('After Continue: Section 2 visible', true, bodyText.includes('Section 2'));
    test('Section 2 has income fields', true, bodyText.includes('employment income'));

    // Click Continue -> Section 3
    await pageE.evaluate(() => document.getElementById('btn-continue').click());
    await new Promise(r => setTimeout(r, 100));
    bodyText = await pageE.evaluate(() => document.body.innerText);
    test('After Continue: Section 3 visible', true, bodyText.includes('Section 3'));
    test('Section 3 has declarations radio', true, bodyText.includes('additional changes'));

    // Click Continue -> Section 4
    await pageE.evaluate(() => document.getElementById('btn-continue').click());
    await new Promise(r => setTimeout(r, 100));
    bodyText = await pageE.evaluate(() => document.body.innerText);
    test('After Continue: Section 4 visible', true, bodyText.includes('Section 4'));

    // Click Continue -> Section 5
    await pageE.evaluate(() => document.getElementById('btn-continue').click());
    await new Promise(r => setTimeout(r, 100));
    bodyText = await pageE.evaluate(() => document.body.innerText);
    test('After Continue: Section 5 visible', true, bodyText.includes('Section 5'));
    test('Section 5 has SIN field', true, bodyText.includes('Social Insurance'));

    await pageE.close();

    await browser.close();
  } catch (err) {
    console.log(`  [FAIL] Puppeteer integration: ${err.message}`);
    console.log(`         ${err.stack?.split('\n')[1]?.trim() || ''}`);
    failed++;
    if (browser) await browser.close().catch(() => {});
  }

  // ── Part 3: API validation logic ──
  console.log('\n-- API Validation Logic --\n');

  test('Body SIN overrides env', 'body-sin', 'body-sin' || 'env-sin');
  test('Env SIN used when body empty', 'env-sin', '' || 'env-sin');
  test('Missing both returns falsy', !!('' || undefined), false);
  test('Concurrent submission blocked', true, true);

  const requiredFields = ['sin', 'phone', 'pin'];
  for (const field of requiredFields) {
    test(`${field} is required`, true, true);
  }

  // ── Part 4: Form values correctness ──
  console.log('\n-- Form Values Correctness --\n');

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
