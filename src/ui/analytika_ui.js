/* ============================================================
 * ANALYTIKA — SBĚR, ZÁLOŽKA V NASTAVENÍ A HEAT MAPA (#25+#26+#27)
 * 17. 8. 2026. Logika je v src/analytika.js (čistá, testovaná);
 * tady bydlí jen DOM: odposlech událostí, odesílání dávek, karta
 * v Nastavení → Analytika a heat vrstva s přepínačem v liště.
 *
 * Zásady (rozhodnutí J. V. 17. 8. 2026): vše vidí a ovládá JEN
 * administrátor; sběr je agregovaný (žádná stopa jednotlivce);
 * nečinnost nad 2 minuty se do času nepočítá; čas se dělí OCK/PROJ;
 * analytika nejde do záloh. GDPR text čeká na právníka — dokud je
 * ANALYTIKA_GDPR_TEXT prázdný, uživatelům se nic neukazuje.
 * ============================================================ */

const ANL = {
  sber: null,            // null = ještě nevíme (před přihlášením se nesbírá)
  den: null,             // rozpracovaný denní agregát (fronta k odeslání)
  casy: {},              // číslo zakázky → {ock, proj} sekundy k odeslání
  cas: null,             // krokovací automat měření času (casNovy)
  timer: null,
  heat: false,           // heat režim zapnut?
  heatData: null,        // data ze serveru {kliky, zdrz, zalozky}
  heatMetrika: 'kliky',
  heatObdobi: 30,        // dní zpět
  prehled: null,         // souhrn pro záložku Nastavení → Analytika
  prehledObdobi: 'mesic',
};

/* ---------- sběr událostí ---------- */

function analytikaBezi() { return ANL.sber === true && !!(ONLINE_STAV && ONLINE_STAV.ja); }

/* klíč prvku z DOM: záložka + značka + (onclick / oninput / text) */
function analytikaKlicPrvku(el) {
  const popis = el.getAttribute('onclick') || el.getAttribute('oninput')
    || el.getAttribute('onchange') || (el.textContent || '').trim().slice(0, 40) || el.id;
  return analytikaKlic(typeof TAB !== 'undefined' ? TAB : '?', el.tagName, popis);
}

function analytikaUdalost(u) {
  if (!analytikaBezi()) return;
  if (!ANL.den) ANL.den = analytikaNovyDen();
  analytikaPridej(ANL.den, u);
}

/* Aktivita pro měření času (#25): každá interakce posune automat. Mezera
 * se přičte části (OCK/PROJ) podle záložky, kde běžela PŘEDCHOZÍ práce. */
function analytikaAktivita() {
  if (!analytikaBezi()) return;
  const cast = analytikaCastZTabu(typeof TAB !== 'undefined' ? TAB : '');
  const pred = ANL.cas ? { ock: ANL.cas.ock, proj: ANL.cas.proj } : null;
  ANL.cas = casKrok(ANL.cas, Date.now(), cast);
  if (!pred) return;
  const dOck = ANL.cas.ock - pred.ock, dProj = ANL.cas.proj - pred.proj;
  if (dOck <= 0 && dProj <= 0) return;
  /* přírůstek jde k PRÁVĚ OTEVŘENÉ zakázce — bez čísla se čas neukládá
   * (nová neuložená zakázka dostane čas až od chvíle, kdy má číslo) */
  const cislo = (typeof ZAK !== 'undefined' && ZAK && String(ZAK.cislo || '').trim());
  if (!cislo) return;
  const c = ANL.casy[cislo] || (ANL.casy[cislo] = { ock: 0, proj: 0 });
  c.ock += Math.max(0, dOck); c.proj += Math.max(0, dProj);
}

function analytikaStart() {
  if (ANL.timer) return;                       // jen jednou za život stránky
  document.addEventListener('click', ev => {
    const el = ev.target.closest('button, select, [role=tab], .nast-tabs button, [id^=tab-]');
    analytikaAktivita();
    if (!el || !analytikaBezi()) return;
    const klic = analytikaKlicPrvku(el);
    analytikaUdalost({ typ: 'klik', klic });
    const pocet = analytikaPocetZKliku(klic);
    if (pocet) analytikaUdalost({ typ: 'pocet', co: pocet });
    if (el.id && el.id.indexOf('tab-') === 0)
      analytikaUdalost({ typ: 'zalozka', tab: el.id.slice(4) });
  }, true);
  /* zdržení = čas soustředění na poli (focus→blur), zaokrouhlený na sekundy */
  let fokus = null;
  document.addEventListener('focusin', ev => {
    const el = ev.target.closest('input, select, textarea');
    fokus = el ? { klic: analytikaKlicPrvku(el), od: Date.now() } : null;
  });
  document.addEventListener('focusout', () => {
    if (!fokus) return;
    const sek = Math.round((Date.now() - fokus.od) / 1000);
    if (sek >= 1 && sek <= 3600) analytikaUdalost({ typ: 'zdrz', klic: fokus.klic, sek });
    fokus = null;
  });
  ['keydown', 'pointerdown', 'input'].forEach(t =>
    document.addEventListener(t, analytikaAktivita, true));
  window.addEventListener('error', () => analytikaUdalost({ typ: 'pocet', co: 'chyby' }));
  ANL.timer = setInterval(analytikaOdesli, 60 * 1000);
  window.addEventListener('beforeunload', analytikaOdesli);
}

function analytikaOdesli() {
  if (!analytikaBezi()) return;
  const maDen = ANL.den && (Object.keys(ANL.den.kliky).length || Object.keys(ANL.den.zdrz).length
    || Object.keys(ANL.den.zalozky).length || Object.values(ANL.den.pocty).some(n => n > 0));
  const maCasy = Object.keys(ANL.casy).length > 0;
  if (!maDen && !maCasy) return;
  const davka = { akce: 'udalosti' };
  if (maDen) { davka.den = ANL.den; ANL.den = null; }
  if (maCasy) { davka.casy = ANL.casy; ANL.casy = {}; }
  onlineApi('/api/analytika', davka).then(d => {
    if (d && d.sber === false) ANL.sber = false;   // administrátor mezitím vypnul
  }).catch(() => {
    /* neodeslaná dávka se vrací do fronty — statistika nesmí nikdy rušit práci */
    if (davka.den) ANL.den = ANL.den ? analytikaSlij(ANL.den, davka.den) : davka.den;
    if (davka.casy) Object.entries(davka.casy).forEach(([z, c]) => {
      const v = ANL.casy[z] || (ANL.casy[z] = { ock: 0, proj: 0 });
      v.ock += c.ock; v.proj += c.proj;
    });
  });
}

/* volá se z onlinePoPrihlaseni: zjistí stav sběru a nastartuje odposlech */
function analytikaPoPrihlaseni() {
  return onlineApi('/api/analytika?akce=rezim').then(d => {
    ANL.sber = d.sber !== false;
    if (ANL.sber) { analytikaStart(); analytikaUdalost({ typ: 'pocet', co: 'prihlaseni' }); }
  }).catch(() => { ANL.sber = null; });
}

/* ---------- záložka Nastavení → Analytika (jen administrátor) ---------- */

function analytikaObdobiRozsah(volba) {
  const dnes = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  if (volba === 'mesic') return { od: iso(new Date(dnes.getFullYear(), dnes.getMonth(), 2)), do: iso(dnes) };
  if (volba === 'rok') return { od: iso(new Date(dnes.getFullYear(), 0, 2)), do: iso(dnes) };
  return { od: '2020-01-01', do: iso(dnes) };    // vše (retence stejně drží 24 měsíců)
}

function analytikaNactiPrehled() {
  const r = analytikaObdobiRozsah(ANL.prehledObdobi);
  return onlineApi('/api/analytika?od=' + r.od + '&do=' + r.do).then(d => {
    ANL.prehled = d;
    if (typeof renderNastaveni === 'function') renderNastaveni();
  }).catch(e => {
    ANL.prehled = { chyba: e.message };
    if (typeof renderNastaveni === 'function') renderNastaveni();
  });
}

function analytikaPrehledObdobi(v) { ANL.prehledObdobi = v; ANL.prehled = null; analytikaNactiPrehled(); }

function analytikaVypinac(zap) {
  onlineApi('/api/analytika', { akce: 'rezim', sber: !!zap }).then(() => {
    ANL.sber = !!zap;
    if (zap) analytikaStart();
    analytikaNactiPrehled();
  }).catch(e => alert('Nastavení sběru se neuložilo: ' + e.message));
}

function analytikaCasText(sek) {
  const min = Math.round((+sek || 0) / 60);
  return min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60) + ' min' : min + ' min';
}

/* srovnání měsíc/měsíc a rok/rok z řady poMesicich (rozhodnutí 17. 8.:
 * „24 měsíců s možností porovnávat měsíční a roční vývoj") */
function analytikaSrovnani(poMesicich) {
  const mesice = Object.keys(poMesicich || {}).sort();
  if (!mesice.length) return '';
  const radek = (m) => {
    const p = (poMesicich[m] || analytikaNovyDen()).pocty;
    return `<tr><td>${esc(m)}</td><td style="text-align:right">${p.zakazky}</td>
      <td style="text-align:right">${p.kalkulace}</td><td style="text-align:right">${p.tiskyWord}</td>
      <td style="text-align:right">${p.tiskyNahled}</td><td style="text-align:right">${p.prihlaseni}</td>
      <td style="text-align:right">${p.chyby}</td></tr>`;
  };
  return `<table style="max-width:640px;margin-top:6px">
    <tr><th>Měsíc</th><th>Zakázky</th><th>Kalkulace</th><th>Tisky Word</th><th>Tisky náhled</th><th>Přihlášení</th><th>Chyby</th></tr>
    ${mesice.map(radek).join('')}</table>`;
}

function nastAnalytika() {
  if (!(typeof jeAdmin === 'function' ? jeAdmin() : false))
    return '<div class="note">Analytiku vidí jen administrátor.</div>';
  if (!(ONLINE_STAV && ONLINE_STAV.ja))
    return '<div class="note">Analytika žije na serveru — přihlaste se prosím.</div>';
  if (!ANL.prehled) { analytikaNactiPrehled(); return '<div class="note">Načítám data ze serveru…</div>'; }
  if (ANL.prehled.chyba)
    return `<div class="neg">Data se nenačetla: ${esc(ANL.prehled.chyba)}</div>
      <div class="btns"><button class="mini" onclick="ANL.prehled=null;renderNastaveni()">Zkusit znovu</button></div>`;

  const p = ANL.prehled, c = p.celkem.pocty;
  const sber = p.rezim && p.rezim.sber !== false;
  const zalozky = Object.entries(p.celkem.zalozky || {}).sort((a, b) => b[1] - a[1]);
  const top = Object.entries(p.celkem.kliky || {}).filter(([k]) => k !== '…ostatni')
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  const casy = Object.entries(p.casy || {}).sort((a, b) => (b[1].ock + b[1].proj) - (a[1].ock + a[1].proj));

  return `<div class="sec-title">Sběr dat</div>
    <div class="note">Sběr je ${sber ? '<b>zapnutý</b>' : '<b style="color:#b91c1c">vypnutý</b>'}${p.rezim && p.rezim.kdy
      ? ' (naposledy změnil ' + esc(p.rezim.kdo || '?') + ' ' + esc(String(p.rezim.kdy).slice(0, 10)) + ')' : ''}.
      Ukládají se výhradně <b>součty za všechny uživatele za den</b> — chování jednotlivce dohledat nejde.
      Denní souhrny se drží 24 měsíců, starší se mažou. Analytika se nezálohuje.</div>
    <div class="btns"><button class="mini" onclick="analytikaVypinac(${sber ? 'false' : 'true'})">
      ${sber ? 'Vypnout sběr' : 'Zapnout sběr'}</button></div>
    ${typeof ANALYTIKA_GDPR_TEXT === 'string' && ANALYTIKA_GDPR_TEXT
      ? `<div class="note" style="white-space:pre-wrap">${esc(ANALYTIKA_GDPR_TEXT)}</div>`
      : `<div class="note">Informační text o zpracování údajů pro uživatele se doplní po konzultaci
         s právníkem — do té doby se uživatelům nic nezobrazuje (a měřit se smí, jen dokud jde o čistě
         anonymní souhrny, což tahle verze dodržuje).</div>`}

    <div class="sec-title">Přehled užívání (#27)</div>
    <div class="kl-radio">
      ${[['mesic', 'tento měsíc'], ['rok', 'letošní rok'], ['vse', 'vše (24 měsíců)']].map(([v, t]) =>
        `<label><input type="radio" name="anlObdobi" ${ANL.prehledObdobi === v ? 'checked' : ''}
          onchange="analytikaPrehledObdobi('${v}')"> ${t}</label>`).join('')}
    </div>
    <table style="max-width:640px">
      <tr><td>Založené zakázky</td><td style="text-align:right"><b>${c.zakazky}</b></td></tr>
      <tr><td>Nové kalkulace (varianty)</td><td style="text-align:right"><b>${c.kalkulace}</b></td></tr>
      <tr><td>Tisky do Wordu (nabídky + smlouvy)</td><td style="text-align:right"><b>${c.tiskyWord}</b></td></tr>
      <tr><td>Tisky přes náhled</td><td style="text-align:right"><b>${c.tiskyNahled}</b></td></tr>
      <tr><td>Přihlášení</td><td style="text-align:right"><b>${c.prihlaseni}</b></td></tr>
      <tr><td>Chybové hlášky v prohlížeči</td><td style="text-align:right"><b>${c.chyby}</b></td></tr>
      <tr><td class="note">Dnů se záznamem</td><td class="note" style="text-align:right">${p.dnu}</td></tr>
    </table>
    <div class="note" style="font-weight:600;margin-top:8px">Vývoj po měsících (srovnání měsíc/měsíc, rok/rok):</div>
    ${analytikaSrovnani(p.poMesicich)}
    <div class="note" style="font-weight:600;margin-top:8px">Nejotevíranější záložky:</div>
    <div class="note">${zalozky.length ? zalozky.map(([t, n]) => esc(t) + ' (' + n + '×)').join(', ') : 'zatím nic'}</div>
    <div class="note" style="font-weight:600;margin-top:8px">Nejpoužívanější prvky:</div>
    <div class="note">${top.length ? top.map(([k, n]) => esc(k.split('|').pop()) + ' (' + n + '×)').join(', ') : 'zatím nic'}</div>

    <div class="sec-title">Čas nad kalkulacemi (#25)</div>
    <div class="note">Aktivní práce (mezera nad 2 minuty se nepočítá), odděleně OCK a PROJ. Čas se váže
      k <b>zakázce</b>, ne k účtu — je to podklad pro sazby, ne pro hodnocení lidí.</div>
    ${casy.length ? `<table style="max-width:640px">
        <tr><th>Zakázka</th><th>OCK</th><th>PROJ</th><th>Celkem</th></tr>
        ${casy.slice(0, 30).map(([z, cz]) => `<tr><td>${esc(z)}</td>
          <td style="text-align:right">${analytikaCasText(cz.ock)}</td>
          <td style="text-align:right">${analytikaCasText(cz.proj)}</td>
          <td style="text-align:right"><b>${analytikaCasText(cz.ock + cz.proj)}</b></td></tr>`).join('')}
      </table>${casy.length > 30 ? `<div class="note">…a dalších ${casy.length - 30} zakázek.</div>` : ''}`
      : '<div class="note">Zatím žádný změřený čas.</div>'}

    <div class="sec-title">Heat mapa (#26)</div>
    <div class="note">Zapíná se přepínačem <b>🔥 Heat mapa</b> vpravo nahoře v liště (vidíte ho jen vy).
      Kreslí se přes živou aplikaci: podbarvení a počty u tlačítek, polí a záložek; přepnete-li záložku,
      mapa jede s vámi. Prvky bez jediného použití dostanou šedý čárkovaný rámeček.</div>`;
}

/* ---------- heat mapa (#26) ---------- */

function heatPrepinacHtml() {
  if (!(typeof jeAdmin === 'function' && jeAdmin())) return '';
  return `<button class="mini" onclick="heatPrepni()" title="Heat mapa užívání — vidí jen administrátor"
    style="${ANL.heat ? 'background:#f97316;border-color:#f97316;color:#fff;font-weight:600' : ''}">🔥 Heat mapa</button>`;
}

function heatPrepni() {
  ANL.heat = !ANL.heat;
  if (!ANL.heat) { heatSmaz(); heatPanelSmaz(); renderOnlineLista(); return; }
  renderOnlineLista();
  heatNacti();
}

function heatNacti() {
  const od = new Date(Date.now() - ANL.heatObdobi * 24 * 3600 * 1000).toISOString().slice(0, 10);
  onlineApi('/api/analytika?od=' + od + '&do=9999-12-31').then(d => {
    ANL.heatData = d.celkem;
    heatKresli(); heatPanel();
  }).catch(e => {
    ANL.heat = false; renderOnlineLista();
    alert('Heat mapa se nenačetla: ' + e.message);
  });
}

/* Úklid: po vypnutí nesmí v aplikaci zůstat JEDINÝ pixel mapy (poučení
 * z návrhu 17. 8. — odznaky přežívaly vypnutí a rozbíjely rozhraní). */
function heatSmaz() {
  document.querySelectorAll('.heat-tint, .heat-badge').forEach(e => e.remove());
  document.querySelectorAll('[data-heat-styl]').forEach(e => {
    /* Vrátit PŮVODNÍ inline styl, ne prázdno: některá tlačítka nesou vlastní
     * inline barvy z návrhu (např. zelené „Přejít na technickou specifikaci",
     * 19. 8. 2026) a mazání na prázdno by je po vypnutí mapy odbarvilo. */
    e.style.cssText = e.dataset.heatPuvodni || '';
    delete e.dataset.heatStyl;
    delete e.dataset.heatPuvodni;
  });
}
function heatPanelSmaz() { const p = document.getElementById('heatPanel'); if (p) p.remove(); }

const HEAT_RAMPA = [[255, 241, 224], [253, 186, 116], [249, 115, 22], [194, 66, 12], [124, 45, 18]];
function heatBarva(t) {
  const seg = Math.min(3.999, Math.max(0, t) * 4), i = Math.floor(seg), f = seg - i;
  const c = HEAT_RAMPA[i].map((v, x) => Math.round(v + (HEAT_RAMPA[i + 1][x] - v) * f));
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',';
}

function heatHodnota(el) {
  const mapa = (ANL.heatData || {})[ANL.heatMetrika] || {};
  return mapa[analytikaKlicPrvku(el)] || 0;
}

function heatKresli() {
  heatSmaz();
  if (!ANL.heat || !ANL.heatData) return;
  const prvky = [...document.querySelectorAll('button, select, [id^=tab-]')]
    .filter(el => el.offsetParent !== null && !el.closest('#heatPanel'));
  /* Normování po KARTÁCH (rozhodnutí z návrhu): frekventovaná záložka nesmí
   * přebít barvy polí uvnitř karet — maximum se hledá v nejbližší kartě. */
  const skupina = el => el.closest('.card, .nast-tabs, nav, header') || document.body;
  const maxima = new Map();
  prvky.forEach(el => {
    const s = skupina(el), v = heatHodnota(el);
    maxima.set(s, Math.max(maxima.get(s) || 0, v));
  });
  prvky.forEach(el => {
    const v = heatHodnota(el);
    const max = maxima.get(skupina(el)) || 1;
    el.dataset.heatStyl = '1';
    el.dataset.heatPuvodni = el.style.cssText || '';   // k obnově po vypnutí mapy
    if (v === 0) {
      el.style.outline = '2px dashed #b3bcc9'; el.style.outlineOffset = '1px';
    } else {
      const t = v / max;
      el.style.background = heatBarva(t) + (0.15 + 0.30 * t) + ')';
      el.style.boxShadow = '0 0 0 2px ' + heatBarva(Math.min(1, t + 0.15)) + '0.85)';
    }
    const badge = document.createElement('span');
    badge.className = 'heat-badge';
    badge.textContent = ANL.heatMetrika === 'zdrz' ? analytikaCasText(v) : (v || '0') + '×';
    badge.style.cssText = 'position:absolute;transform:translate(-14px,-9px);z-index:99;'
      + 'background:' + (v === 0 ? '#8a94a3' : '#1a2332') + ';color:#fff;font-size:10px;'
      + 'font-weight:600;padding:0 6px;border-radius:8px;pointer-events:none;white-space:nowrap';
    const r = el.getBoundingClientRect();
    badge.style.position = 'fixed';
    badge.style.left = (r.right) + 'px'; badge.style.top = (r.top) + 'px';
    badge.style.transform = 'none';
    document.body.appendChild(badge);
  });
}

function heatPanel() {
  heatPanelSmaz();
  const p = document.createElement('div');
  p.id = 'heatPanel';
  p.style.cssText = 'position:fixed;right:18px;bottom:18px;width:280px;background:#fff;'
    + 'border:1px solid #dde3ea;border-radius:12px;box-shadow:0 8px 28px rgba(20,30,50,.2);'
    + 'z-index:100;font-size:12.5px';
  p.innerHTML = `<div style="background:#1a2332;color:#fff;padding:9px 13px;border-radius:11px 11px 0 0">
      🔥 Heat mapa <span style="float:right;font-weight:400;color:#9fb0c8;font-size:11px">jen administrátor</span></div>
    <div style="padding:11px 13px">
      <div style="margin-bottom:8px">Metrika:
        <label><input type="radio" name="heatMet" ${ANL.heatMetrika === 'kliky' ? 'checked' : ''}
          onchange="heatMetrika('kliky')"> kliknutí</label>
        <label><input type="radio" name="heatMet" ${ANL.heatMetrika === 'zdrz' ? 'checked' : ''}
          onchange="heatMetrika('zdrz')"> zdržení</label></div>
      <div style="margin-bottom:8px">Období:
        <select onchange="heatObdobi(this.value)">
          ${[[30, 'posledních 30 dní'], [90, 'poslední 3 měsíce'], [365, 'posledních 12 měsíců'], [730, 'vše (24 měsíců)']]
            .map(([v, t]) => `<option value="${v}" ${+ANL.heatObdobi === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
      <div style="height:11px;border-radius:6px;background:linear-gradient(90deg,#fff1e0,#fdba74,#f97316,#c2410c,#7c2d12)"></div>
      <div style="display:flex;justify-content:space-between;color:#6b7686;font-size:11px"><span>málo</span><span>hodně</span></div>
      <div style="border-top:1px solid #dde3ea;margin-top:8px;padding-top:7px;color:#6b7686;font-size:11px">
        Souhrn za všechny uživatele — stopa jednotlivce neexistuje. Sytost barev se měří po kartách.
        Šedý čárkovaný rámeček = bez jediného použití.</div>
    </div>`;
  document.body.appendChild(p);
}

function heatMetrika(m) { ANL.heatMetrika = m; heatKresli(); }
function heatObdobi(dni) { ANL.heatObdobi = +dni; heatNacti(); }

/* mapa jede s uživatelem: po každém překreslení aplikace se překreslí i ona
 * (render() volá heatPoRenderu — viz zapojení v ui/common.js) */
function heatPoRenderu() { if (ANL.heat && ANL.heatData) setTimeout(heatKresli, 60); }
