/* ─── Upstash Redis REST helper (pipeline) ─── */
async function redisPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  /* ─── Auth check ─── */
  const key = req.query.key;
  if (!key || key !== process.env.ANALYTICS_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Generate last 30 days
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  /* ─── Fetch core stats (single pipeline) ─── */
  const coreCommands = [
    ['GET', 'pv:total'],           // 0
    ['GET', `pv:d:${today}`],      // 1
    ['GET', 'cl:total'],           // 2
    ['SCARD', 'uv:all'],           // 3
    ['SCARD', `uv:d:${today}`],    // 4
    ['SMEMBERS', 'meta:pages'],    // 5
    ['SMEMBERS', 'meta:apps'],     // 6
    ['LRANGE', 'ev:recent', '0', '49'],  // 7
    ...days.map(d => ['GET', `pv:d:${d}`]),             // 8..37
    ...days.map(d => ['SCARD', `uv:d:${d}`]),           // 38..67
  ];

  try {
    const results = await redisPipeline(coreCommands);

    const totalViews = parseInt(results[0]?.result || 0);
    const todayViews = parseInt(results[1]?.result || 0);
    const totalClicks = parseInt(results[2]?.result || 0);
    const uniqueVisitors = parseInt(results[3]?.result || 0);
    const todayUnique = parseInt(results[4]?.result || 0);
    const pages = results[5]?.result || [];
    const apps = results[6]?.result || [];
    const recentEvents = (results[7]?.result || []).map(e => {
      try { return JSON.parse(e); } catch { return null; }
    }).filter(Boolean);

    // Daily data (last 30 days)
    const dailyViews = days.map((d, i) => ({
      date: d,
      views: parseInt(results[8 + i]?.result || 0),
      unique: parseInt(results[8 + 30 + i]?.result || 0)
    }));

    /* ─── Fetch per-page and per-app counts ─── */
    let pageStats = [];
    let appStats = [];

    if (pages.length || apps.length) {
      const detailCommands = [
        ...pages.map(p => ['GET', `pv:p:${p}`]),
        ...apps.map(a => ['GET', `cl:a:${a}`]),
      ];
      const detailResults = await redisPipeline(detailCommands);

      pageStats = pages.map((p, i) => ({
        page: p,
        views: parseInt(detailResults[i]?.result || 0)
      })).sort((a, b) => b.views - a.views);

      appStats = apps.map((a, i) => ({
        app: a,
        clicks: parseInt(detailResults[pages.length + i]?.result || 0)
      })).sort((a, b) => b.clicks - a.clicks);
    }

    // Aggregate browser/device from recent events
    const browsers = {};
    const devices = {};
    recentEvents.forEach(ev => {
      browsers[ev.b] = (browsers[ev.b] || 0) + 1;
      devices[ev.d] = (devices[ev.d] || 0) + 1;
    });

    res.status(200).json({
      totalViews,
      todayViews,
      totalClicks,
      uniqueVisitors,
      todayUnique,
      pageStats,
      appStats,
      dailyViews,
      recentEvents,
      browsers,
      devices,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
