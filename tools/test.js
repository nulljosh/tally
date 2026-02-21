const { checkAllSections } = require('../src/scraper');

async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('   BC SELF-SERVE SCRAPER TEST SUITE    ');
  console.log('═══════════════════════════════════════\n');

  const tests = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1: Basic scraper execution
  console.log('[TEST 1] Running scraper with default settings...');
  try {
    const result = await checkAllSections({ headless: true });

    if (!result) {
      console.log('[FAIL] FAIL: No result returned');
      tests.failed++;
    } else if (result.success === false) {
      console.log('[WARNING]  WARN: Scraper returned error:', result.error);
      tests.warnings++;
    } else {
      console.log('[OK] PASS: Scraper executed');
      tests.passed++;

      // Test 2: Validate result structure
      console.log('\n[TEST 2] Validating result structure...');
      const requiredFields = ['success', 'timestamp', 'sections'];
      const missingFields = requiredFields.filter(field => !(field in result));

      if (missingFields.length > 0) {
        console.log(`[FAIL] FAIL: Missing fields: ${missingFields.join(', ')}`);
        tests.failed++;
      } else {
        console.log('[OK] PASS: Result structure valid');
        tests.passed++;
      }

      // Test 3: Check sections scraped
      console.log('\n[TEST 3] Checking sections scraped...');
      const expectedSections = ['Notifications', 'Messages', 'Payment Info', 'Service Requests'];
      const sections = result.sections || {};
      const sectionNames = Object.keys(sections);

      if (expectedSections.every(s => sectionNames.includes(s))) {
        console.log('[OK] PASS: All expected sections present');
        tests.passed++;
      } else {
        const missing = expectedSections.filter(s => !sectionNames.includes(s));
        console.log(`[WARNING]  WARN: Missing sections: ${missing.join(', ')}`);
        tests.warnings++;
      }

      // Test 4: Check for successful data extraction
      console.log('\n[TEST 4] Checking data extraction...');
      let successfulSections = 0;
      let errorSections = 0;

      for (const [name, data] of Object.entries(sections)) {
        if (data.error) {
          console.log(`  [WARNING]  ${name}: Error - ${data.error}`);
          errorSections++;
        } else if (data.success) {
          const itemCount = data.allText?.length || 0;
          console.log(`  [OK] ${name}: ${itemCount} items extracted`);
          successfulSections++;
        }
      }

      if (successfulSections > 0) {
        console.log(`[OK] PASS: ${successfulSections}/${expectedSections.length} sections extracted data`);
        tests.passed++;
      } else {
        console.log('[FAIL] FAIL: No sections extracted data');
        tests.failed++;
      }

      if (errorSections > 0) {
        console.log(`[WARNING]  WARN: ${errorSections} sections had errors`);
        tests.warnings++;
      }

      // Test 5: Check file outputs
      console.log('\n[TEST 5] Checking file outputs...');
      const fs = require('fs');

      if (result.sections) {
        let screenshotsFound = 0;
        for (const [name, data] of Object.entries(result.sections)) {
          if (data.screenshot && fs.existsSync(data.screenshot)) {
            screenshotsFound++;
          }
        }

        if (screenshotsFound > 0) {
          console.log(`[OK] PASS: ${screenshotsFound} screenshot(s) saved`);
          tests.passed++;
        } else {
          console.log('[WARNING]  WARN: No screenshots found');
          tests.warnings++;
        }
      }
    }
  } catch (error) {
    console.log(`[FAIL] FAIL: Scraper threw error: ${error.message}`);
    tests.failed++;
  }

  // Results summary
  console.log('\n═══════════════════════════════════════');
  console.log('          TEST RESULTS SUMMARY         ');
  console.log('═══════════════════════════════════════');
  console.log(`[OK] Passed:   ${tests.passed}`);
  console.log(`[FAIL] Failed:   ${tests.failed}`);
  console.log(`[WARNING]  Warnings: ${tests.warnings}`);
  console.log('═══════════════════════════════════════\n');

  // Grade
  const total = tests.passed + tests.failed + tests.warnings;
  const score = total > 0 ? (tests.passed / total) * 100 : 0;

  console.log('GRADE:');
  if (score >= 80) {
    console.log(`🌟 EXCELLENT: ${score.toFixed(1)}%`);
  } else if (score >= 60) {
    console.log(`[OK] GOOD: ${score.toFixed(1)}%`);
  } else if (score >= 40) {
    console.log(`[WARNING]  NEEDS WORK: ${score.toFixed(1)}%`);
  } else {
    console.log(`[FAIL] FAILING: ${score.toFixed(1)}%`);
  }

  console.log('\nRECOMMENDATIONS:');
  if (tests.failed > 0) {
    console.log('- Fix critical failures in scraper logic');
  }
  if (tests.warnings >= 2) {
    console.log('- Address rate limiting issues with longer delays');
    console.log('- Consider implementing exponential backoff for retries');
  }
  if (score < 60) {
    console.log('- Review BC government site changes');
    console.log('- Consider alternative scraping approaches');
  }

  process.exit(tests.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite crashed:', error);
  process.exit(1);
});
