export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const query = String(req.body?.query || '').trim();
    const requestedLimit = Number(req.body?.limit || 8);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 8, 1), 12);

    if (!query) return res.status(200).json({ results: [] });

    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'KlaroKI/1.0 (+https://klaro-ki.de)' }
    });

    if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);

    const xml = await response.text();
    const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

    const clean = (value = '') => {
      let text = String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      return text.replace(/\s+/g, ' ').trim();
    };

    const get = (block, tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? clean(match[1]) : '';
    };

    const results = blocks.map(block => ({
      title: get(block, 'title'),
      url: get(block, 'link'),
      summary: get(block, 'description'),
      date: get(block, 'pubDate'),
      source: 'Google News RSS'
    })).filter(item => item.title && item.url).slice(0, limit);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
