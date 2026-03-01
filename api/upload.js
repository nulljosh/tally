const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  // Security: require secret token
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.UPLOAD_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data } = req.body;
  const userId = req.headers['x-user-id'] || req.query.userId;

  if (!data) {
    return res.status(400).json({ error: 'Missing data' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Missing userId' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  try {
    const blob = await put(`tally-cache/${userId}/results.json`, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
    });

    res.status(200).json({
      success: true,
      blobUrl: blob.url,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
