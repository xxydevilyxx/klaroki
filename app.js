(() => {
  "use strict";

  // Öffentlich verwendbarer Supabase Publishable Key.
  // Niemals einen sb_secret_ / service_role-Key hier eintragen.
  const SUPABASE_URL = "https://iiogaaolzzpveefthdxj.supabase.co";
  const SUPABASE_PUBLIC_KEY = "sb_publishable_iF3lNT3PXdx08jb5e6rjDA_LfuAuBHO";

  const $ = (selector) => document.querySelector(selector);
  const messages = $("#chatMessages");
  const input = $("#chatInput");
  const form = $("#chatForm");
  const researchResults = $("#researchResults");
  const researchStatus = $("#researchStatus");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  async function supabase(path, options={}) {
    const headers = {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      Accept: "application/json",
      ...(options.body ? {"Content-Type":"application/json","Prefer":"return=representation"} : {}),
      ...(options.headers || {})
    };
    const r = await fetch(SUPABASE_URL + path, {...options, headers});
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg = data?.message || data?.hint || data?.details || data?.error_description || (typeof data==="string" ? data : r.statusText);
      throw new Error(`HTTP ${r.status}: ${msg}`);
    }
    return data;
  }

  async function knowledgeSearch(query) {
    const rows = await supabase("/rest/v1/knowledge?select=id,question,answer,source,created_at&order=created_at.desc&limit=100");
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    return (rows || []).filter(row => {
      const hay = `${row.question} ${row.answer} ${row.source}`.toLowerCase();
      return !terms.length || terms.some(term => hay.includes(term));
    }).slice(0,5);
  }

  async function webSearch(query) {
    // Kostenfreie Recherche-Orchestrierung: mehrere Suchrichtungen parallel, danach serverseitig dedupliziert und priorisiert.
    const r = await fetch(`/api/research-search`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({query, limit:12})
    });
    const text=await r.text();
    let data=null; try{data=text?JSON.parse(text):null}catch{data={raw:text}}
    if(!r.ok) throw new Error(`Websuche HTTP ${r.status}: ${data?.error || data?.message || text || r.statusText}`);
    return Array.isArray(data) ? data : (data.results || []);
  }

  function tokenize(text){
    return [...new Set(cleanWebText(text).toLowerCase().replace(/[^a-z0-9äöüß\- ]/gi,' ').split(/\s+/).filter(t=>t.length>=4))];
  }

  function relevanceScore(query, item){
    const terms=tokenize(query);
    const title=cleanWebText(item.title||'').toLowerCase();
    const body=cleanWebText(item.summary||'').toLowerCase();
    let score=0;
    for(const term of terms){
      if(title.includes(term)) score+=3;
      else if(body.includes(term)) score+=1;
    }
    return score;
  }

  function uniqueSources(items){
    const seen=new Set();
    return items.filter(item=>{
      const key=(item.url||item.title||'').toLowerCase().replace(/[^a-z0-9äöüß]/gi,'');
      if(!key||seen.has(key)) return false;
      seen.add(key); return true;
    });
  }


  function addMessage(text, role, extra="") {
    const row=document.createElement("div");
    row.className=`message ${role}`;
    const avatar=document.createElement("div");
    avatar.className="message-avatar"; avatar.textContent=role==="assistant"?"✦":"DU";
    const content=document.createElement("div");
    const name=document.createElement("div"); name.className="message-name";
    name.textContent=role==="assistant"?"Klaro KI · POLITIK-ASSISTENT":"DU";
    const bubble=document.createElement("div"); bubble.className="message-bubble"; bubble.textContent=text;
    content.append(name,bubble);
    if(extra) content.insertAdjacentHTML("beforeend",extra);
    row.append(avatar,content); messages.append(row); messages.scrollTop=messages.scrollHeight;
  }

  function renderResearch(knowledge, web) {
    // Webtreffer werden bewusst NICHT als separate Ergebnisliste angezeigt.
    // Sie fließen in die formulierte Antwort im Chat ein.
    researchResults.innerHTML = '<div class="research-empty">Die Recherche wurde in die Antwort von Klaro KI eingearbeitet.</div>';
  }

  function cleanWebText(value) {
    // Web-RSS liefert häufig HTML-Fragmente (z.B. <a href="...">Titel</a>).
    // Diese dürfen niemals als sichtbarer HTML-Code in der Chatantwort landen.
    const source = String(value ?? "");
    const textarea = document.createElement("textarea");
    textarea.innerHTML = source;
    const decoded = textarea.value;
    const doc = new DOMParser().parseFromString(decoded, "text/html");
    return (doc.body?.textContent || decoded)
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  function isForecastQuestion(query) {
    const q = cleanWebText(query).toLowerCase();
    return /\b(wird|bleibt|übersteht|überstehen|schafft|gewinnt|verliert|kommt|tritt.*zurück|tritt.*zurueck|bis.*bleiben|noch.*jahr|dieses jahr|nächstes jahr|naechstes jahr|zukunft|prognose|wahrscheinlichkeit|wahrscheinlich|was passiert wenn|was passiert falls|wenn .* an die macht|falls .* an die macht)\b/.test(q);
  }

  function isPoliticalQuestion(query) {
    return /\b(afd|spd|cdu|csu|fdp|grüne|gruene|linke|partei|bundestag|bundesregierung|bundesrat|kanzler|minister|wahl|koalition|gesetz|politik|politisch)\b/i.test(cleanWebText(query));
  }

  const TOPIC_SIGNALS = [
    ['Wirtschaft', /wirtschaft|unternehmen|steuern|haushalt|finanz|arbeit|industrie|energiepreis|wirtschaftspolit/i],
    ['Energie & Klima', /klima|energie|strom|gas|heizung|emission|koh|windkraft|erneuerbar/i],
    ['Migration & Asyl', /migration|migrat|asyl|grenze|abschieb|einwander|flücht|fluecht/i],
    ['Europa & EU', /europa|\beu\b|euro|brüssel|bruessel|europä|europae/i],
    ['Innenpolitik & Demokratie', /demokr|innenpolitik|verfassung|verfassungs|staat|gericht|bundesverfass|institution/i],
    ['Soziales', /rente|sozial|bürgergeld|buergergeld|gesundheit|pflege|familie|wohnen|miete/i],
    ['Außenpolitik', /ukraine|russland|nato|außenpolitik|aussenpolitik|krieg|verteidigung|bundeswehr/i]
  ];

  function extractSentences(text) {
    return cleanWebText(text)
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 45 && s.length <= 420);
  }

  function topicCoverage(items) {
    return TOPIC_SIGNALS.map(([name, pattern]) => {
      const sources = items.filter(item => pattern.test(`${item.title} ${item.summary}`));
      return { name, count: sources.length };
    }).filter(x => x.count > 0).sort((a,b) => b.count - a.count);
  }

  function buildKlaroAssessment(query, webItems, knowledgeText) {
    if (!webItems.length) return '';

    const political = isPoliticalQuestion(query);
    const forecast = isForecastQuestion(query);
    if (!political && !forecast) return '';

    const topics = topicCoverage(webItems);
    const topicText = topics.slice(0, 4).map(t => `${t.name} (${t.count} Quelle${t.count === 1 ? '' : 'n'})`).join(', ');

    const sentences = [];
    const seen = new Set();
    const queryTerms = tokenize(query).filter(t => t.length >= 5);
    const rankedItems = webItems.map(item => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      let score = 0;
      queryTerms.forEach(term => { if (text.includes(term)) score += 2; });
      TOPIC_SIGNALS.forEach(([, pattern]) => { if (pattern.test(text)) score += 1; });
      if (item.summary) score += 1;
      return { item, score };
    }).sort((a,b) => b.score - a.score);

    for (const { item } of rankedItems) {
      for (const sentence of extractSentences(item.summary || item.title)) {
        const key = sentence.toLowerCase().replace(/[^a-z0-9äöüß]/gi, '').slice(0, 180);
        if (seen.has(key)) continue;
        seen.add(key);
        sentences.push(sentence);
        if (sentences.length >= 4) break;
      }
      if (sentences.length >= 4) break;
    }

    if (forecast) {
      let assessment = '**Klaro KI Einordnung:** Aus der Gesamtschau der recherchierten Quellen ergibt sich kein sicherer Zukunftsausgang, aber sehr wohl ein belastbares Bild der Themen, die bei der angenommenen Entwicklung relevant wären.';
      if (topicText) assessment += ` In den ausgewerteten Quellen konzentrieren sich die konkreten Aussagen vor allem auf ${topicText}.`;
      if (sentences.length) assessment += ` Die wiederkehrenden Aussagen stützen dabei insbesondere folgende Punkte: ${sentences.slice(0, 3).join(' ')}`;
      assessment += ' Das ist eine aus den Quellen abgeleitete Einordnung von Klaro KI und keine Vorhersage. Ob und in welchem Umfang sich daraus politische Veränderungen ergeben würden, hängt zusätzlich von Mehrheiten, Gesetzen, Gerichten und anderen institutionellen Voraussetzungen ab.';
      return assessment;
    }

    let assessment = '**Klaro KI Einordnung:** Die Recherche spricht nicht für eine bloße Einzelmeldung, sondern zeigt mehrere zusammenhängende Aspekte der Frage.';
    if (topicText) assessment += ` Besonders stark vertreten sind ${topicText}.`;
    if (sentences.length) assessment += ` Aus diesen Quellen ergibt sich als gemeinsame Linie: ${sentences.slice(0, 3).join(' ')}`;
    if (knowledgeText.length) assessment += ' Die Wissensbasis ergänzt diese Recherche, wurde aber gegenüber den aktuellen Webquellen nachrangig behandelt.';
    return assessment;
  }

  function buildSourceList(web) {
    return web.slice(0, 8).map((r) => {
      const title = cleanWebText(r.title || "");
      const source = cleanWebText(r.source || "");
      const date = cleanWebText(r.date || "");
      if (!title) return "";
      return `• ${title}${source ? ` — ${source}` : ""}${date ? ` (${date})` : ""}`;
    }).filter(Boolean).join("\n");
  }

  function buildWebSynthesis(query, knowledge, web) {
    const cleanQuery = cleanWebText(query);
    const knowledgeText = knowledge.slice(0, 5)
      .map(r => cleanWebText(r.answer || ""))
      .filter(Boolean);
    const webItems = uniqueSources(web.slice().sort((a,b)=>relevanceScore(cleanQuery,b)-relevanceScore(cleanQuery,a))).slice(0,10).map(r => ({
      title: cleanWebText(r.title || ""),
      summary: cleanWebText(r.summary || ""),
      source: cleanWebText(r.source || ""),
      date: cleanWebText(r.date || ""),
      url: cleanWebText(r.url || "")
    })).filter(r => r.title || r.summary);

    if (!knowledgeText.length && !webItems.length) return "";

    const terms=tokenize(cleanQuery);
    const combined=webItems.map(r=>`${r.title} ${r.summary}`.toLowerCase()).join(' ');
    const matchedTerms=terms.filter(t=>combined.includes(t));
    const dateValues=webItems.map(r=>Date.parse(r.date)).filter(Number.isFinite).sort((a,b)=>b-a);
    const newest=dateValues.length?new Date(dateValues[0]).toLocaleDateString('de-DE'):null;
    const sources=buildSourceList(webItems);
    const assessment = buildKlaroAssessment(cleanQuery, webItems, knowledgeText);

    if (isForecastQuestion(cleanQuery)) {
      const evidence = webItems.slice(0, 5).map(r => r.summary && r.title && !r.summary.startsWith(r.title) ? `${r.title}: ${r.summary}` : (r.summary || r.title)).join(" ");
      let reply = `**Kurz gesagt:** Die Frage beschreibt ein mögliches zukünftiges Szenario. Die Recherche kann zeigen, welche dokumentierten Positionen, Entwicklungen und Voraussetzungen dafür relevant sind, aber keinen sicheren Ausgang vorhersagen.`;
      if (evidence) reply += `\n\n**Was die aktuelle Recherche zeigt:** ${evidence}`;
      if (assessment) reply += `\n\n${assessment}`;
      if (knowledgeText.length) reply += `\n\n**Wissensbasis:** ${knowledgeText.slice(0, 3).join(" ")}`;
      reply += `\n\n**Fazit:** Die Einordnung basiert auf der Gesamtschau der gefundenen Quellen. ${newest ? `Der jüngste gefundene Veröffentlichungszeitpunkt ist ${newest}.` : ''}`;
      if (sources) reply += `\n\n**Ausgewertete Quellen:**\n${sources}`;
      return reply;
    }

    const findings=[];
    for(const item of webItems.slice(0,6)){
      const text=item.summary && item.title && !item.summary.startsWith(item.title) ? `${item.title}: ${item.summary}` : (item.summary || item.title);
      if(text) findings.push(text);
    }

    const sections=[];
    sections.push(`**Recherche-Ergebnis:** Zu „${cleanQuery}“ wurden ${webItems.length} relevante Veröffentlichungen zusammengeführt. ${matchedTerms.length ? `Die Suchtreffer decken ${matchedTerms.length} zentrale Begriffe der Frage ab.` : ''}`);
    if(findings.length) sections.push(`**Wesentliche Befunde:** ${findings.join(" ")}`);
    if(assessment) sections.push(assessment);
    if(knowledgeText.length) sections.push(`**Ergänzung aus der Wissensbasis:** ${knowledgeText.slice(0,3).join(" ")}`);
    if(sources) sections.push(`**Quellen:**\n${sources}`);
    return sections.join("\n\n");
  }


  async function ask(query) {
    researchStatus.textContent="RECHERCHE LÄUFT …";
    researchResults.innerHTML='<div class="research-empty">Wissensbasis und Webquellen werden ausgewertet …</div>';
    let knowledge=[], web=[], errors=[];
    try{knowledge=await knowledgeSearch(query)}catch(e){errors.push("Wissensbasis: "+e.message)}
    try{web=await webSearch(query)}catch(e){errors.push("Websuche: "+e.message)}

    renderResearch(knowledge, web);
    researchStatus.textContent=errors.length ? "TEILWEISE VERFÜGBAR" : "RECHERCHE ABGESCHLOSSEN";

    let reply = buildWebSynthesis(query, knowledge, web);
    if (!reply) {
      reply = "Ich konnte zu dieser Frage derzeit keine verwertbaren Informationen aus der Wissensbasis oder der Webrecherche zusammenstellen.";
    }
    if (errors.length) reply += "\n\nHinweis: " + errors.join(" · ");
    return reply;
  }

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const q=input.value.trim(); if(!q)return;
    addMessage(q,"user"); input.value=""; input.style.height="auto";
    const aiStartedAt=Date.now();
    window.klaroAnalyticsTrack?.("ai_interaction", { metadata:{type:"ai_question"} });
    addMessage("Ich recherchiere in der Wissensbasis und im Web …","assistant");
    try{
      const reply=await ask(q);
      const last=messages.querySelector(".message:last-child .message-bubble");
      if(last) last.textContent=reply;
      window.klaroAnalyticsTrack?.("ai_result", { ai_duration_ms:Date.now()-aiStartedAt, ai_success:true, metadata:{type:"ai_result"} });
    }catch(err){
      const last=messages.querySelector(".message:last-child .message-bubble");
      if(last) last.textContent="Recherchefehler: "+err.message;
      window.klaroAnalyticsTrack?.("ai_result", { ai_duration_ms:Date.now()-aiStartedAt, ai_success:false, metadata:{type:"ai_error"} });
    }
  });
  input.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit();}
  });
  input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,130)+"px"});
  document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>{input.value=b.dataset.prompt;form.requestSubmit()}));
  $("#clearChat").addEventListener("click",()=>{
    messages.replaceChildren();
    addMessage("Gespräch zurückgesetzt. Stelle eine politische Frage.","assistant");
    researchResults.innerHTML='<div class="research-empty">Die Recherche wird direkt in die nächste Antwort eingearbeitet.</div>';
    researchStatus.textContent="Bereit";
  });
})();
/* CMP-Datenschutzeinstellungen */
(function(){
  const openPrivacy=()=>{if(typeof window.__tcfapi==='function'){window.__tcfapi('displayConsentUi',2,()=>{});}else{alert('Die Datenschutzeinstellungen werden geladen.');}};
  const privacyButton=document.getElementById('privacyButton');
  const cmpPrivacyFab=document.getElementById('cmpPrivacyFab');
  if(privacyButton) privacyButton.addEventListener('click',openPrivacy);
  if(cmpPrivacyFab) cmpPrivacyFab.addEventListener('click',openPrivacy);
})();


/* Datenschutzgebundene, pseudonyme Klaro-KI-Analyse */
(function(){
  const SESSION_ID = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let consent = false;
  let startedAt = Date.now();
  let started = false;
  let heartbeatTimer = null;
  let visitorId = null;

  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

  function parseBrowser(ua){
    if(/Edg\//i.test(ua)) return 'Edge';
    if(/OPR\//i.test(ua)) return 'Opera';
    if(/Firefox\//i.test(ua)) return 'Firefox';
    if(/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if(/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
    return 'Sonstiger';
  }
  function parseOS(ua){
    if(/Windows/i.test(ua)) return 'Windows';
    if(/Android/i.test(ua)) return 'Android';
    if(/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if(/Mac OS X/i.test(ua)) return 'macOS';
    if(/Linux/i.test(ua)) return 'Linux';
    return 'Sonstiges';
  }
  function parseDevice(ua){
    if(/iPad|Tablet/i.test(ua)) return 'Tablet';
    if(/Mobi|Android/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }
  function measurementConsent(callback){
    if(typeof window.__tcfapi !== 'function') return;
    window.__tcfapi('getTCData', 2, (tcData, success) => {
      if(!success || !tcData) return;
      const allowed = tcData.gdprApplies === false || tcData.purpose?.consents?.[7] === true;
      callback(Boolean(allowed));
    });
  }
  function refreshConsent(){
    measurementConsent(allowed => {
      consent=allowed;
      if(consent){ startAnalytics(); }
      else if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer=null; }
    });
  }
  async function send(eventName, extra={}){
    if(!consent) return;
    const ua=navigator.userAgent||'';
    const payload={
      event_name:eventName,
      visitor_id:visitorId,
      session_id:SESSION_ID,
      path:location.pathname,
      page_title:document.title,
      referrer:document.referrer,
      device_type:parseDevice(ua),
      browser:parseBrowser(ua),
      os:parseOS(ua),
      screen_width:window.screen?.width||null,
      screen_height:window.screen?.height||null,
      language:navigator.language||null,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,
      ...extra
    };
    try{
      await fetch('/api/analytics-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:eventName==='session_end'});
    }catch(_){ }
  }
  function startAnalytics(){
    if(started) return;
    started=true;
    startedAt=Date.now();
    try{ visitorId=localStorage.getItem('klaro_analytics_visitor_id') || makeId(); localStorage.setItem('klaro_analytics_visitor_id',visitorId); }catch(_){ visitorId=makeId(); }
    send('session_start');
    send('page_view');
    heartbeatTimer=setInterval(()=>send('session_heartbeat',{duration_ms:Date.now()-startedAt}),15000);
  }
  window.klaroAnalyticsTrack=(eventName,extra={})=>send(eventName,extra);
  function finish(){
    if(!started || !consent) return;
    if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer=null; }
    send('session_end',{duration_ms:Date.now()-startedAt});
  }
  window.addEventListener('pagehide',finish);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') send('session_heartbeat',{duration_ms:Date.now()-startedAt}); });
  document.addEventListener('click',e=>{
    const target=e.target.closest('a,button');
    if(!target || target.id==='privacyButton' || target.id==='cmpPrivacyFab') return;
    const label=(target.textContent||target.getAttribute('aria-label')||target.getAttribute('href')||'').replace(/\s+/g,' ').trim().slice(0,80);
    send('ui_interaction',{metadata:{type:'click',label}});
  },{passive:true});

  const waitForCmp=()=>{
    if(typeof window.__tcfapi==='function'){
      measurementConsent(()=>refreshConsent());
      try{ window.__tcfapi('addEventListener',2,()=>refreshConsent()); }catch(_){ }
      return;
    }
    setTimeout(waitForCmp,500);
  };
  waitForCmp();
})();
