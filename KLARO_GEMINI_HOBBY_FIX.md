# Klaro KI – Gemini Hobby-Plan Fix

## Warum diese Version?

Vercel Hobby erlaubt maximal 12 Serverless Functions pro Deployment.
Die zusätzliche `api/ai.js` hat das Deployment auf 13 Functions erhöht.

Deshalb wird `api/ai.js` NICHT mehr verwendet.

## Änderungen

### `api/web-search.js`
Die bereits vorhandene Function übernimmt zusätzlich:

- Gemini 2.5 Flash
- Google Search Grounding
- Supabase-Wissensbasis als Kontext
- Quellenextraktion aus Gemini Grounding
- weiterhin die bisherige Google-News-RSS-Funktion für andere Aufrufer

Der Gemini-Aufruf erfolgt über:
`POST /api/web-search`
mit:
`mode: "gemini"`

### `app.js`
Die Recherche ruft jetzt die vorhandene `/api/web-search` Function mit `mode: "gemini"` auf.

## WICHTIG

Die alte Datei muss aus dem Repository gelöscht werden:

`api/ai.js`

Sonst bleibt die Vercel Function-Anzahl bei 13 und das Deployment schlägt weiterhin fehl.

## Vercel Environment

Bereits gesetzte Variable:

`GEMINI_API_KEY`

Optional:

`GEMINI_MODEL=gemini-2.5-flash`

## Nicht geändert

- HTML/Design
- CSS
- `vercel.json`
- Supabase-Schema
- Admin/Auth
- Analytics
