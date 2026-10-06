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
    return String(value ?? "").replace(/[&<>\"']/g, c => ({
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

  async function geminiResearch(query, knowledge) {
    const r = await fetch("/api/web-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        knowledge,
        mode: "gemini"
      })
    });

    const text = await r.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      throw new Error(
        `KI-Recherche HTTP ${r.status}: ` +
        `${data?.error || data?.message || text || r.statusText}`
      );
    }

    if (!data?.answer) {
      throw new Error("Die KI-Recherche hat keine Antwort geliefert.");
    }

    return data;
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

  function renderResearch(knowledge, aiResult) {
    const sources = Array.isArray(aiResult?.sources)
      ? aiResult.sources
      : [];

    if (!sources.length) {
      researchResults.innerHTML =
        '<div class="research-empty">Die Recherche wurde in die Antwort von Klaro KI eingearbeitet.</div>';
      return;
    }

    const sourceItems = sources
      .slice(0, 8)
      .map(source => {
        const title = String(source.title || source.url || "");
        const url = String(source.url || "");
        return url
          ? `• ${title} — ${url}`
          : `• ${title}`;
      })
      .join("\n");

    researchResults.innerHTML =
      '<div class="research-empty">Die Recherche wurde in die Antwort von Klaro KI eingearbeitet.</div>';
    researchResults.dataset.sources = sourceItems;
  }

  async function ask(query) {
    researchStatus.textContent="RECHERCHE LÄUFT …";
    researchResults.innerHTML='<div class="research-empty">Wissensbasis und aktuelle Quellen werden durch Klaro KI ausgewertet …</div>';

    let knowledge=[];
    let errors=[];

    try {
      knowledge=await knowledgeSearch(query);
    } catch(e) {
      errors.push("Wissensbasis: " + e.message);
    }

    const aiResult = await geminiResearch(query, knowledge);

    renderResearch(knowledge, aiResult);

    researchStatus.textContent =
      errors.length
        ? "TEILWEISE VERFÜGBAR"
        : "RECHERCHE ABGESCHLOSSEN";

    let reply = aiResult.answer;

    if (errors.length) {
      reply += "\n\nHinweis: " + errors.join(" · ");
    }

    return reply;
  }

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const q=input.value.trim(); if(!q)return;
    addMessage(q,"user"); input.value=""; input.style.height="auto";
    const aiStartedAt=Date.now();
    window.klaroAnalyticsTrack?.("ai_interaction", { metadata:{type:"ai_question"} });
    addMessage("Ich recherchiere in der Wissensbasis und in aktuellen Quellen …","assistant");
    try{
      const reply=await ask(q);
      const last=messages.querySelector(".message:last-child .message-bubble");
      if(last) last.textContent=reply;
      window.klaroAnalyticsTrack?.("ai_result", { ai_duration_ms:Date.now()-aiStartedAt, ai_success:true, metadata:{type:"ai_result", model:"gemini"} });
    }catch(err){
      const last=messages.querySelector(".message:last-child .message-bubble");
      if(last) last.textContent="Recherchefehler: "+err.message;
      researchStatus.textContent="RECHERCHE FEHLGESCHLAGEN";
      window.klaroAnalyticsTrack?.("ai_result", { ai_duration_ms:Date.now()-aiStartedAt, ai_success:false, metadata:{type:"ai_error", model:"gemini"} });
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
