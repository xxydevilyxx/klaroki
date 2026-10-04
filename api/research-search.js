// Kostenfreie, serverseitige Recherche-Orchestrierung für Klaro KI.
// Nutzt ausschließlich Google News RSS und die vorhandene Supabase-Wissensbasis.

function clean(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function get(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? clean(match[1]) : '';
}

function buildQueries(query) {
  const q = clean(query);
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\- ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .filter(w => !/^(dass|oder|aber|auch|eine|einer|einem|einen|über|unter|nach|wird|wurde|sind|sein|kann|könnte|warum|wie|was|wer|wann|welche|welcher|welches|gibt|gibt's|haben|hat|für|von|mit|auf|aus|der|die|das|den|dem|des|und|nicht)$/i.test(w));
  const unique = [...new Set(words)];
  const core = unique.slice(0, 7).join(' ');
  const queries = [q];
  if (core && core !== q.toLowerCase()) queries.push(`${core} aktuell`);
  if (core) queries.push(`${core} Hintergrund`);

  const lower = q.toLowerCase();
  if (/bundestag|bundesregierung|bundesrat|gesetz|partei|wahl|kanzler|minister|polit/i.test(lower)) {
    queries.push(`${core} Bundestag Bundesregierung`);
  }
  return [...new Set(queries)].slice(0, 4);
}

async function fetchRss(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
  const response = await fetch(rssUrl, {
    headers: { 'User-Agent': 'KlaroKI/2.0 (+https://klaroki3.vercel.app)' }
  });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  const xml = await response.text();
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map(block => ({
    title: get(block, 'title'),
    url: get(block, 'link'),
    summary: get(block, 'description'),
    date: get(block, 'pubDate'),
    source: 'Google News RSS',
    query
  })).filter(item => item.title && item.url);
}

function normalizeKey(item) {
  return `${item.url || ''}|${item.title || ''}`.toLowerCase().replace(/[^a-z0-9äöüß]/gi, '').slice(0, 500);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const query = clean(req.body?.query || '');
    if (!query) return res.status(200).json({ results: [], queries: [] });

    const queries = buildQueries(query);
    const settled = await Promise.allSettled(queries.map(fetchRss));
    const merged = [];
    const seen = new Set();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        const key = normalizeKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }

    // Relevanzscore: Suchbegriffe im Titel/Snippet zählen stärker als Treffer nur im Datum.
    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(t => t.length >= 4))];
    const scored = merged.map(item => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      const title = item.title.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 3;
        else if (text.includes(term)) score += 1;
      }
      if (/bundestag|bundesregierung|bundesrat|gesetz|verordnung|statistik|amt/i.test(item.title)) score += 1;
      return { ...item, relevance: score };
    }).sort((a, b) => b.relevance - a.relevance);

    res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=300');
    return res.status(200).json({ results: scored.slice(0, 12), queries });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
