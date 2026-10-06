/**
 * Klaro KI – bestehende Websuche + Gemini Research
 *
 * Wichtig:
 * Diese Datei bleibt die bestehende /api/web-search Function.
 * Dadurch wird keine zusätzliche Vercel Serverless Function erzeugt.
 *
 * Environment:
 *   GEMINI_API_KEY
 * Optional:
 *   GEMINI_MODEL=gemini-2.5-flash
 */

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";

const GEMINI_SYSTEM_PROMPT = `
Du bist Klaro KI, ein politischer Recherche- und Einordnungsassistent.

Arbeite neutral, quellenorientiert und transparent.
- Nutze Google Search für aktuelle und überprüfbare Informationen.
- Berücksichtige mehrere relevante Perspektiven und Quellen.
- Priorisiere Primärquellen, Behörden, offizielle Dokumente und seriöse etablierte Medien.
- Trenne belegte Fakten, Einordnung und Unsicherheit klar.
- Wenn Quellen widersprechen, benenne den Widerspruch ausdrücklich.
- Erfinde niemals Quellen, Zahlen, Zitate oder Tatsachen.
- Bei politischen Prognosen keine Scheinsicherheit erzeugen.
- Antworte auf Deutsch und strukturiert.
- Nenne am Ende die wichtigsten tatsächlich verwendeten Webquellen mit Titel und URL.
`;

function clean(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function get(block, tag) {
  const match = block.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  );
  return match ? clean(match[1]) : '';
}

function extractSources(candidate) {
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();

  return chunks
    .map(chunk => chunk?.web)
    .filter(Boolean)
    .map(web => ({
      title: clean(web.title || '').slice(0, 500),
      url: String(web.uri || '').slice(0, 2000)
    }))
    .filter(source => {
      if (!source.url || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 10);
}

async function geminiResearch(query, knowledge) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini ist nicht konfiguriert. Bitte GEMINI_API_KEY in Vercel prüfen.'
    );
  }

  const knowledgeContext = Array.isArray(knowledge) && knowledge.length
    ? `

Interne Wissensbasis:
${knowledge.slice(0, 5).map((item, index) => `
[KB-${index + 1}]
Frage: ${clean(item?.question || '').slice(0, 1000)}
Antwort: ${clean(item?.answer || '').slice(0, 5000)}
Quelle: ${clean(item?.source || '').slice(0, 1000)}
`).join('\n')}

Die Wissensbasis dient nur als interner Kontext. Sie ist nicht automatisch eine aktuelle Webquelle.
`
    : '';

  const prompt = `Beantworte diese politische Nutzerfrage:

"${clean(query).slice(0, 4000)}"

${knowledgeContext}

Recherchiere aktuelle Informationen eigenständig mit Google Search.
Nutze mehrere einschlägige Quellen, wenn dies für die Frage sinnvoll ist.
Vergleiche die Quellen und benenne relevante Widersprüche.

Strukturiere die Antwort nach Möglichkeit in:
1. Kurzantwort
2. Was belegt ist
3. Einordnung / unterschiedliche Positionen
4. Unsicherheiten oder offene Punkte
5. Quellen

Keine erfundenen Quellen, Zahlen oder Tatsachen.`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: GEMINI_SYSTEM_PROMPT }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 3000
      }
    })
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      raw ||
      response.statusText
    );
  }

  const candidate = data?.candidates?.[0];
  const answer = (candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .join('\n')
    .trim();

  if (!answer) {
    throw new Error('Gemini hat keine Antwort geliefert.');
  }

  return {
    answer,
    sources: extractSources(candidate),
    model: GEMINI_MODEL
  };
}

async function rssSearch(query, limit) {
  const rssUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=de&gl=DE&ceid=DE:de`;

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'KlaroKI/1.0 (+https://klaro-ki.de)'
    }
  });

  if (!response.ok) {
    throw new Error(`RSS HTTP ${response.status}`);
  }

  const xml = await response.text();
  const blocks =
    xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.map(block => ({
    title: get(block, 'title'),
    url: get(block, 'link'),
    summary: get(block, 'description'),
    date: get(block, 'pubDate'),
    source: 'Google News RSS'
  }))
  .filter(item => item.title && item.url)
  .slice(0, limit);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      error: 'Method Not Allowed'
    });
  }

  const query = clean(req.body?.query || '').trim();

  if (!query) {
    return res.status(200).json({
      results: []
    });
  }

  // Neue Gemini-Recherche nutzt diese bereits vorhandene Function.
  // Dadurch entsteht keine 13. Vercel Function.
  if (req.body?.mode === 'gemini') {
    try {
      const knowledge = Array.isArray(req.body?.knowledge)
        ? req.body.knowledge.slice(0, 5)
        : [];

      const result = await geminiResearch(query, knowledge);

      res.setHeader(
        'Cache-Control',
        'no-store'
      );

      return res.status(200).json(result);
    } catch (error) {
      return res.status(502).json({
        error: `Gemini-Recherche: ${error?.message || String(error)}`,
        model: GEMINI_MODEL
      });
    }
  }

  // Bestehendes Verhalten für andere Aufrufer bleibt erhalten.
  try {
    const requestedLimit = Number(req.body?.limit || 8);
    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 8,
        1
      ),
      12
    );

    const results = await rssSearch(query, limit);

    res.setHeader(
      'Cache-Control',
      's-maxage=120, stale-while-revalidate=300'
    );

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || String(error)
    });
  }
}
