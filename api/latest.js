const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    const userId = req.session?.userId || req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    // Find the blob by prefix (most recent cache)
    const { blobs } = await list({ prefix: `tally-cache/${userId}/` });

    if (!blobs || blobs.length === 0) {
      console.warn('[LATEST] No cache blob found');
      return res.status(200).json({
        cached: false,
        data: null,
        message: 'Cache not available - run npm run check locally to scrape'
      });
    }

    // Fetch the blob content with timeout
    const targetBlob = blobs.find((b) => b.pathname === `tally-cache/${userId}/results.json`) || blobs[0];
    const blobUrl = targetBlob.url;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    console.log(`[LATEST] Fetching blob: ${targetBlob.pathname}`);
    const response = await fetch(blobUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Blob fetch returned HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[LATEST] Blob retrieved, age: ${new Date() - new Date(data.updatedAt)}ms`);

    res.status(200).json({
      cached: true,
      data,
      blobAge: new Date() - new Date(data.updatedAt),
      blobUrl,
    });
  } catch (err) {
    console.error('[LATEST] Error:', err.message);
    res.status(200).json({
      cached: false,
      data: null,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};
