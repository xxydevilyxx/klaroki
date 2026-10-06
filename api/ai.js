/**
 * Klaro KI – Gemini Research Endpoint
 *
 * Serverseitige Gemini-Anbindung mit Google Search Grounding.
 * Der API-Key wird niemals an den Browser ausgeliefert.
 *
 * Vercel Environment:
 *   GEMINI_API_KEY = Gemini API key
 * Optional:
 *   GEMINI_MODEL = gemini-2.5-flash
 */

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";

const SYSTEM_PROMPT = `
Du bist Klaro KI, ein politischer Recherche- und Einordnungsassistent.

Arbeitsweise:
- Arbeite neutral, quellenorientiert und transparent.
- Nutze Google Search für aktuelle und überprüfbare Informationen.
- Berücksichtige mehrere relevante Perspektiven und Quellen.
- Priorisiere Primärquellen, Behörden, offizielle Dokumente und seriöse etablierte Medien.
- Trenne belegte Fakten, Einordnung und Unsicherheit klar.
- Wenn Quellen widersprechen, benenne den Widerspruch ausdrücklich.
- Erfinde niemals Quellen, Zahlen, Zitate oder Tatsachen.
- Bei politischen Prognosen keine Scheinsicherheit erzeugen.
- Antworte auf Deutsch und strukturiert.
- Nenne am Ende die wichtigsten tatsächlich verwendeten Webquellen mit Titel und URL, soweit Google Search Quellen geliefert hat.

Führe die Recherche nicht nur auf Basis eines einzelnen Suchtreffers durch. Vergleiche die relevanten Quellen und fasse die belastbare Quellenlage zusammen.
`;

function cleanText(value, maxLength = 12000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .slice(0, maxLength);
}

function extractSources(candidate) {
  const chunks =
    candidate?.groundingMetadata?.groundingChunks || [];

  const seen = new Set();

  return chunks
    .map(chunk => chunk?.web)
    .filter(Boolean)
    .map(web => ({
      title: cleanText(web.title, 500),
      url: cleanText(web.uri, 2000)
    }))
    .filter(source => {
      if (!source.url || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      error:
        "Gemini ist noch nicht konfiguriert. Bitte GEMINI_API_KEY in Vercel setzen."
    });
  }

  const query = cleanText(req.body?.query, 4000).trim();

  if (!query) {
    return res.status(400).json({
      error: "query fehlt"
    });
  }

  const knowledge = Array.isArray(req.body?.knowledge)
    ? req.body.knowledge.slice(0, 5).map(item => ({
        question: cleanText(item?.question, 1000),
        answer: cleanText(item?.answer, 5000),
        source: cleanText(item?.source, 1000)
      }))
    : [];

  const knowledgeContext = knowledge.length
    ? `

Interne Wissensbasis:
${knowledge
  .map(
    (item, index) =>
      `[KB-${index + 1}]
Frage: ${item.question}
Antwort: ${item.answer}
Quelle: ${item.source}`
  )
  .join("\n\n")}

Die interne Wissensbasis ist Kontext. Gib sie nicht als aktuelle Webquelle aus.
`
    : "";

  const userPrompt = `Beantworte diese politische Nutzerfrage:

"${query}"

${knowledgeContext}

Recherchiere aktuelle Informationen eigenständig mit Google Search.
Nutze mehrere einschlägige Quellen, wenn dies für die Frage sinnvoll ist.
Vergleiche die Quellen, achte auf unterschiedliche Perspektiven und benenne relevante Widersprüche.

Strukturiere die Antwort nach Möglichkeit in:
1. Kurzantwort
2. Was belegt ist
3. Einordnung / unterschiedliche Positionen
4. Unsicherheiten oder offene Punkte
5. Quellen

Gib keine erfundenen Quellen oder unbelegten Tatsachen aus.`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ],
        tools: [
          {
            google_search: {}
          }
        ],
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
      const message =
        data?.error?.message ||
        raw ||
        response.statusText;

      return res.status(response.status).json({
        error: `Gemini API: ${message}`,
        model: GEMINI_MODEL
      });
    }

    const candidate = data?.candidates?.[0];

    const answer = (candidate?.content?.parts || [])
      .map(part => part?.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      return res.status(502).json({
        error: "Gemini hat keine Antwort geliefert.",
        model: GEMINI_MODEL
      });
    }

    return res.status(200).json({
      answer,
      sources: extractSources(candidate),
      model: GEMINI_MODEL
    });
  } catch (error) {
    return res.status(502).json({
      error:
        `Gemini-Verbindung fehlgeschlagen: ${error.message}`,
      model: GEMINI_MODEL
    });
  }
}
