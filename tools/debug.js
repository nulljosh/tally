// Debug script to see login page and fix selectors
const { checkPaymentStatus } = require('./scraper');

checkPaymentStatus({ headless: false, keepOpen: true })
  .then(result => {
    console.log('\nDone!');
  })
  .catch(error => {
    console.error('Error:', error);
  });
