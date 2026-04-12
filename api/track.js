const crypto = require('crypto');

/* ─── Upstash Redis REST helper (pipeline) ─── */
async function redisPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

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

function hashIP(ip) {
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.ANALYTICS_SALT || 'sb-portal-analytics'))
    .digest('hex')
    .slice(0, 12);
}

function parseUA(ua) {
  if (!ua) return 'Unknown';
  if (/bot|crawl|spider|slurp|mediapartners/i.test(ua)) return 'Bot';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  return 'Other';
}

function getDevice(ua) {
  if (!ua) return 'Unknown';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, page, app } = req.body || {};
  if (!type || !['pageview', 'click'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown')
    .split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || '';
  const today = new Date().toISOString().slice(0, 10);
  const visitorHash = hashIP(ip);

  let refHost = '';
  try { if (referrer) refHost = new URL(referrer).hostname; } catch { /* ignore */ }

  /* ─── Build Redis pipeline ─── */
  const commands = [
    ['INCR', 'pv:total'],
    ['INCR', `pv:d:${today}`],
    ['SADD', 'uv:all', visitorHash],
    ['SADD', `uv:d:${today}`, visitorHash],
  ];

  if (type === 'pageview' && page) {
    const safePage = page.replace(/[^a-zA-Z0-9/._-]/g, '').slice(0, 100);
    commands.push(['INCR', `pv:p:${safePage}`]);
    commands.push(['SADD', 'meta:pages', safePage]);
  }

  if (type === 'click' && app) {
    const safeApp = app.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60);
    commands.push(['INCR', 'cl:total']);
    commands.push(['INCR', `cl:a:${safeApp}`]);
    commands.push(['SADD', 'meta:apps', safeApp]);
  }

  // Recent event (capped list)
  const event = JSON.stringify({
    t: type === 'pageview' ? 'pv' : 'cl',
    p: page || '',
    a: app || '',
    v: visitorHash.slice(0, 8),
    b: parseUA(ua),
    d: getDevice(ua),
    r: refHost,
    ts: Date.now()
  });
  commands.push(['LPUSH', 'ev:recent', event]);
  commands.push(['LTRIM', 'ev:recent', '0', '199']);

  // TTL on daily keys (90 days)
  commands.push(['EXPIRE', `pv:d:${today}`, String(90 * 86400)]);
  commands.push(['EXPIRE', `uv:d:${today}`, String(90 * 86400)]);

  try {
    await redisPipeline(commands);
    // 1×1 transparent gif for beacon fallback
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
