const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function uploadToBlob() {
  // Find latest results file
  const dataDir = path.join(__dirname, '../data');
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(dataDir, f),
      time: fs.statSync(path.join(dataDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    console.log('No results files found');
    return;
  }

  const latestFile = files[0];
  const data = JSON.parse(fs.readFileSync(latestFile.path, 'utf8'));

  console.log(`Uploading ${latestFile.name}...`);

  // Upload to Vercel
  const UPLOAD_SECRET = process.env.UPLOAD_SECRET;
  const VERCEL_URL = process.env.VERCEL_URL || 'https://tally.vercel.app';

  const response = await fetch(`${VERCEL_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UPLOAD_SECRET}`
    },
    body: JSON.stringify({ data })
  });

  const result = await response.json();
  console.log('Upload result:', result);
}

uploadToBlob().catch(console.error);
