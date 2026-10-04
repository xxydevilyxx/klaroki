KLARO KI – VERCEL KOMPLETTPAKET

Dieses Paket enthält Frontend UND Websuche in einem Vercel-Projekt.

Enthalten:
- index.html
- app.js
- style.css
- api/web-search.js   <- serverseitige Websuche
- vercel.json

DEPLOY:
1. ZIP bei Vercel Drop hochladen: https://vercel.com/new
2. Projekt deployen.
3. Keine TypeScript-/Supabase-Edge-Function separat bei Cloudflare hochladen.

SUPABASE:
- Die Wissensbasis wird weiterhin über den öffentlichen Publishable Key angesprochen.
- Der Secret/Service-Role-Key ist NICHT im Projekt enthalten.
- Die Websuche läuft jetzt über Vercel /api/web-search.


V3-FIX: HTML aus RSS/Web-Ergebnissen wird server- und clientseitig bereinigt. Die Webrecherche wird als normale Klaro-Antwort formuliert; rohe <a href=...>-Tags und lange Google-News-URLs erscheinen nicht mehr.


WERBUNG OHNE GOOGLE

Diese Version enthält bewusst keine Google-AdSense-, Google-Analytics- oder Google-Ads-Skripte.
Die eingebaute Sponsorenfläche ist eine direkte, datensparsame Partnerfläche. Sie kann später durch einen passenden Anbieter ersetzt werden, ohne die politische Antwortlogik zu verändern.

Für Klaro ist ein direktes Sponsoring besonders sauber: Ein Sponsor-Link kann server- oder redaktionell gepflegt werden, ohne Nutzerprofile für personalisierte Werbung aufzubauen.

Hinweis: Drittanbieter-Werbenetzwerke haben jeweils eigene Zulassungs- und Datenschutzbedingungen. Für eine spätere Integration müssen diese separat geprüft werden. EthicalAds wirbt beispielsweise mit kontextbezogener, nicht trackender Werbung, ist aber auf Entwickler-/Technikseiten ausgerichtet und daher nicht automatisch passend für Klaro.
