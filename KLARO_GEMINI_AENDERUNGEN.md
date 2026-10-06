# Klaro KI – Gemini-Anbindung

## Geänderte / neue Dateien

### `api/ai.js` — NEU
Serverseitiger Gemini-Endpunkt.

- verwendet `GEMINI_API_KEY` aus Vercel
- Standardmodell: `gemini-2.5-flash`
- aktiviert Google Search Grounding
- nimmt die vorhandene Supabase-Wissensbasis als Kontext entgegen
- gibt KI-Antwort und erkannte Grounding-Quellen zurück
- API-Key wird nicht an den Browser ausgeliefert

### `app.js` — GEÄNDERT
Nur die Recherche-/Antwortlogik wurde umgestellt.

Vorher:
- Supabase-Wissensbasis
- Google-News-RSS
- regelbasierte JavaScript-Synthese

Nachher:
- Supabase-Wissensbasis
- `/api/ai`
- Gemini + Google Search Grounding
- Gemini übernimmt Recherche, Quellenvergleich und Synthese

Die vorhandene UI, CSS-Struktur, CMP-/Datenschutzlogik und Analytics-Struktur wurden nicht als Design geändert.

## Vercel Environment Variable

Vor dem Einsatz muss in Vercel gesetzt werden:

`GEMINI_API_KEY`

Optional:

`GEMINI_MODEL=gemini-2.5-flash`

Der eigentliche API-Key gehört ausschließlich in Vercel und nicht in den Quellcode.

## Bewusst nicht geändert

- HTML-/Design-Dateien
- CSS
- `vercel.json`
- Supabase-Schema
- Admin-/Auth-Bereich
- Analytics-Endpunkt
- bestehende Wissensbasis
