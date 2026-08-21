/* ================= ZÁLOŽKA ZÁKAZNÍCI (#162, 20. 8. 2026) =================
 *
 * Obrazovka nad databází zákazníků. Model (co je karta, jak se kopíruje do
 * zakázky, co se s čím porovnává) drží src/zakaznici.js — tady je jen
 * hledání, formulář a tlačítka.
 *
 * PRAVIDLO, KTERÉ SE TU NESMÍ PORUŠIT: karta zákazníka jen PŘEDVYPLŇUJE.
 * Do zakázky se zapíše až na kliknutí a zpátky do karty se nic nevrací samo —
 * jedna překlepnutá zakázka by jinak rozbila údaje všem ostatním.
 * ======================================================================== */

const ZAK_DB = {
  seznam: [],           // stažené karty
  nacteno: false,
  nacita: false,        // běží dotaz na server? (proti dvojímu načtení)
  hledat: '',
  otevreny: null,       // rozpracovaná karta (kopie, ne odkaz do seznamu)
  novy: false,
  hlaska: '',
  pracuje: false,
};

function zakazniciMozne() {
  return typeof onlineApi === 'function' && typeof ONLINE_STAV !== 'undefined'
    && ONLINE_STAV.bezi && !!ONLINE_STAV.ja;
}

/* Načtení seznamu. Dvě pojistky, obě nutné (nález při zkoušce 20. 8. 2026):
 *  1) `nacteno` se nastaví i při NEÚSPĚCHU. Kdyby zůstalo false, další
 *     render by načtení zkusil znovu — a protože se render volá i po
 *     doběhnutí dotazu, vznikla by nekonečná smyčka render → fetch →
 *     render, která umlčí i ostatní časovače (například automatické
 *     ukládání zakázky).
 *  2) `nacita` brání druhému souběžnému dotazu, než ten první doběhne. */
function zakazniciNacti() {
  if (!zakazniciMozne() || ZAK_DB.nacita) return Promise.resolve(false);
  ZAK_DB.nacita = true;
  return onlineApi('/api/zakaznici')
    .then(o => { ZAK_DB.seznam = o.zakaznici || []; return true; })
    .catch(e => { ZAK_DB.hlaska = 'Seznam zákazníků se nepodařilo načíst: ' + e.message; return false; })
    .then(v => { ZAK_DB.nacita = false; ZAK_DB.nacteno = true; render(); return v; });
}

function zakazniciHledani(q) { ZAK_DB.hledat = q; render(); }

function zakaznikOtevri(klic) {
  const z = ZAK_DB.seznam.find(x => zakaznikKlic(x) === klic);
  if (!z) return;
  ZAK_DB.otevreny = JSON.parse(JSON.stringify(z));   // kopie: zavření = zahození změn
  ZAK_DB.novy = false; ZAK_DB.hlaska = ''; render();
}

function zakaznikZavri() { ZAK_DB.otevreny = null; ZAK_DB.novy = false; render(); }

function zakaznikNovyUI() {
  ZAK_DB.otevreny = zakaznikNovy(); ZAK_DB.novy = true; ZAK_DB.hlaska = ''; render();
}

/* Založit kartu z otevřené zakázky — nejčastější cesta, jak databáze vznikne
 * (zadání J. V.: začínáme na zelené louce, plní se novými zakázkami). */
function zakaznikZeZakazkyUI() {
  ZAK_DB.otevreny = zakaznikZeZakazky(ZAK);
  ZAK_DB.novy = true;
  ZAK_DB.hlaska = 'Karta je předvyplněná z otevřené zakázky — projděte ji a uložte.';
  prepniTab('zakaznici'); render();
}

function zakaznikSet(id, v) { if (ZAK_DB.otevreny) { ZAK_DB.otevreny[id] = v; } }

function zakaznikUloz() {
  const z = ZAK_DB.otevreny;
  if (!z) return Promise.resolve(false);
  if (!zakaznikKlic(z)) {
    ZAK_DB.hlaska = 'Vyplňte aspoň název, nebo IČO — bez toho nemá karta klíč.';
    render(); return Promise.resolve(false);
  }
  const podobni = ZAK_DB.novy ? zakazniciPodobni(ZAK_DB.seznam, z) : [];
  if (podobni.length && !confirm('Podobného zákazníka už v seznamu máme:\n\n'
      + podobni.map(x => '• ' + (x.nazev || '?') + (x.ico ? ' (IČO ' + x.ico + ')' : '')).join('\n')
      + '\n\nOpravdu založit další kartu?')) return Promise.resolve(false);
  ZAK_DB.pracuje = true; render();
  return onlineApi('/api/zakaznici', { zakaznik: z })
    .then(o => {
      ZAK_DB.pracuje = false;
      const klic = o.klic;
      ZAK_DB.seznam = ZAK_DB.seznam.filter(x => zakaznikKlic(x) !== klic).concat([o.zakaznik]);
      ZAK_DB.otevreny = JSON.parse(JSON.stringify(o.zakaznik));
      ZAK_DB.novy = false;
      ZAK_DB.hlaska = 'Uloženo.';
      render(); return true;
    })
    .catch(e => { ZAK_DB.pracuje = false; ZAK_DB.hlaska = 'Neuloženo: ' + e.message; render(); return false; });
}

function zakaznikSmaz() {
  const z = ZAK_DB.otevreny;
  if (!z || !jeAdminOnline()) return;
  const klic = zakaznikKlic(z);
  if (!confirm('Smazat kartu zákazníka „' + (z.nazev || klic) + '"?\n\n'
    + 'Zakázky zůstanou, ale údaje, které jste u něj jednou dohledali, se ztratí.')) return;
  onlineApi('/api/zakaznici?klic=' + encodeURIComponent(klic), null, 'DELETE')
    .then(() => {
      ZAK_DB.seznam = ZAK_DB.seznam.filter(x => zakaznikKlic(x) !== klic);
      ZAK_DB.otevreny = null; ZAK_DB.hlaska = 'Karta smazána.'; render();
    })
    .catch(e => { ZAK_DB.hlaska = 'Nesmazáno: ' + e.message; render(); });
}

/* ---------- karta → otevřená zakázka ---------- */
function zakaznikDoZakazkyUI(klic) {
  const z = ZAK_DB.seznam.find(x => zakaznikKlic(x) === klic)
    || (ZAK_DB.otevreny && zakaznikKlic(ZAK_DB.otevreny) === klic ? ZAK_DB.otevreny : null);
  if (!z) return;
  if (typeof zamekStop === 'function' && zamekStop()) return;
  if (typeof nahledStop === 'function' && nahledStop('přenesení zákazníka do zakázky')) return;
  const n = zakaznikDoZakazky(z, ZAK);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  ZAK_DB.hlaska = n
    ? 'Do otevřené zakázky se přeneslo ' + n + ' údajů. Cokoli tam přepíšete, se do karty samo nevrátí.'
    : 'V zakázce už bylo všechno stejné — nic se nezměnilo.';
  render();
}

/* ---------- zakázka → karta (nabídne se, nevnucuje se) ---------- */
/* Volá se po uložení zakázky. Když se hlavička liší od karty, ukáže seznam
 * rozdílů a teprve na potvrzení je zapíše. Nikdy nic potichu. */
function zakaznikNabidniAktualizaci() {
  if (!zakazniciMozne() || !ZAK.zakaznikId) return Promise.resolve(false);
  const z = ZAK_DB.seznam.find(x => zakaznikKlic(x) === ZAK.zakaznikId);
  if (!z) return Promise.resolve(false);
  const rozdily = zakaznikRozdily(z, ZAK);
  if (!rozdily.length) return Promise.resolve(false);
  const popis = rozdily.map(r => '• ' + r.label + ': „' + (r.karta || '—') + '" → „' + r.zakazka + '"').join('\n');
  if (!confirm('U zákazníka „' + (z.nazev || '?') + '" se v téhle zakázce liší '
      + rozdily.length + ' údajů:\n\n' + popis
      + '\n\nUložit je i do jeho karty (platí pro příští zakázky)?')) return Promise.resolve(false);
  const novy = zakaznikPrevezmi(JSON.parse(JSON.stringify(z)), rozdily);
  return onlineApi('/api/zakaznici', { zakaznik: novy })
    .then(o => {
      ZAK_DB.seznam = ZAK_DB.seznam.filter(x => zakaznikKlic(x) !== o.klic).concat([o.zakaznik]);
      return true;
    })
    .catch(() => false);
}

/* Převodník pro dotažení z ARES (21. 8. 2026). Karta má jiná jména polí než
 * hlavička zakázky (`nazev` × `objednatel`, `sidlo` × `adresaObjednatele`),
 * ale ARES umí pracovat s čímkoli, co ta čtyři pole má. Vrací proto objekt,
 * který do karty jen ukazuje: čtení i zápis jdou rovnou do ZAK_DB.otevreny,
 * takže se nikde nedrží druhá kopie, která by se mohla rozejít. */
function zakaznikAresHlavicka() {
  const z = ZAK_DB.otevreny || (ZAK_DB.otevreny = zakaznikNovy());
  const mapa = { objednatel: 'nazev', adresaObjednatele: 'sidlo', ico: 'ico', dic: 'dic' };
  const o = {};
  Object.keys(mapa).forEach(k => Object.defineProperty(o, k, {
    enumerable: true,
    get() { return z[mapa[k]]; },
    set(v) { z[mapa[k]] = v; },
  }));
  return o;
}

/* ---------- vykreslení ---------- */

function renderZakaznici() {
  const el = document.getElementById('page-zakaznici');
  if (!el) return;
  if (!zakazniciMozne()) {
    el.innerHTML = `<div class="card"><div class="body"><div class="note">Seznam zákazníků žije
      v online databázi — přihlaste se prosím.</div></div></div>`;
    return;
  }
  /* Seznam se stahuje, teprve když je záložka opravdu otevřená — jinak by
   * si každá relace tahala karty, i když k nim nikdo nejde. */
  if (!ZAK_DB.nacteno) {
    if (typeof TAB !== 'undefined' && TAB === 'zakaznici') zakazniciNacti();
    el.innerHTML = `<div class="card"><div class="body">
      <div class="note">Načítám zákazníky…</div></div></div>`;
    return;
  }

  el.innerHTML = ZAK_DB.otevreny ? zakaznikKartaHtml() : zakazniciSeznamHtml();
}

function zakazniciSeznamHtml() {
  const nalezeni = zakazniciHledej(ZAK_DB.seznam, ZAK_DB.hledat)
    .sort((a, b) => String(a.nazev || '').localeCompare(String(b.nazev || ''), 'cs'));
  const radek = z => {
    const klic = zakaznikKlic(z);
    return `<tr><td style="text-align:left"><b>${esc(z.nazev || '(bez názvu)')}</b></td>
      <td>${esc(z.ico || '—')}</td><td style="text-align:left">${esc(z.sidlo || '—')}</td>
      <td>${esc(String(zakazniciPocetZakazek(klic)))}</td>
      <td>${esc(String(z.upraven || '').slice(0, 10) || '—')}</td>
      <td><button class="mini" onclick="zakaznikOtevri('${escJs(klic)}')">Otevřít</button></td></tr>`;
  };
  return card('Zákazníci', `
    <div class="note">Údaje, které u zákazníka vyplníte jednou, se příště jen přenesou do zakázky —
      nemusíte je psát znovu a nemůžou se rozejít. <b>Zakázka je vždycky pán:</b> karta jen
      předvyplňuje a co v zakázce přepíšete, se sem samo nevrátí.</div>
    ${ZAK_DB.hlaska ? `<div class="note" style="color:var(--acc)">${esc(ZAK_DB.hlaska)}</div>` : ''}
    <!-- Hledání stojí od 21. 8. 2026 VLEVO u tlačítek (zadání J. V.).
         Mřížka řádku ho tlačila k pravému okraji obrazovky, kde ho nikdo
         nehledal — přitom je to první věc, kterou tu člověk dělá. -->
    <div class="btns" style="margin-top:8px;align-items:center">
      <input type="text" style="width:280px" value="${esc(ZAK_DB.hledat)}"
        placeholder="🔎 hledat: název, IČO nebo město…"
        oninput="ZAK_DB.hledat=this.value" onchange="zakazniciHledani(this.value)">
      <button onclick="zakaznikNovyUI()">+ Nový zákazník</button>
      <button class="mini" onclick="zakaznikZeZakazkyUI()">Založit z otevřené zakázky</button>
      <button class="mini" onclick="ZAK_DB.nacteno=false;renderZakaznici()">↻ Načíst znovu</button>
      <span class="note" style="margin-left:auto">${nalezeni.length} z ${ZAK_DB.seznam.length}</span>
    </div>
    ${nalezeni.length ? `<table style="margin-top:10px">
      <tr><th style="text-align:left">Zákazník</th><th>IČO</th><th style="text-align:left">Sídlo</th>
        <th>Zakázek</th><th>Upraveno</th><th></th></tr>
      ${nalezeni.map(radek).join('')}</table>`
      : `<div class="note" style="margin-top:10px">${ZAK_DB.seznam.length
          ? 'Hledání nic nenašlo.'
          : 'Zatím tu není žádný zákazník. Nejrychlejší cesta: otevřete zakázku s vyplněnou '
            + 'hlavičkou a dejte <b>Založit z otevřené zakázky</b>.'}</div>`}
  `, false, 'zakaznici-seznam');
}

/* Kolik zakázek se na kartu odkazuje. Bere se z rejstříku zakázek, ať
 * nevzniká druhá evidence — ta by se rozešla. */
function zakazniciPocetZakazek(klic) {
  const r = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.rejstrik) || null;
  const z = (r && r.zakazky) || [];
  const n = z.filter(x => x && x.zakaznikId === klic).length;
  return n || '—';
}

function zakaznikKartaHtml() {
  const z = ZAK_DB.otevreny;
  const klic = zakaznikKlic(z);
  const radek = p => `<div class="kl-row"><div class="lbl">${esc(p.label)}</div>
    <div><input type="text" value="${esc(z[p.id] == null ? '' : z[p.id])}"
      onchange="zakaznikSet('${escJs(p.id)}', this.value)"></div>
    <div class="src"><span class="note" style="font-size:10px">${p.zak ? 'hlavička zakázky' : 'krycí list'}</span></div></div>`;
  const skupina = (nadpis, ids) => `<h3>${esc(nadpis)}</h3>`
    + ZAKAZNIK_POLE.filter(p => ids.includes(p.id)).map(radek).join('');

  return `<div class="kl-doc">
    <h1>${esc(z.nazev || 'Nový zákazník')}</h1>
    ${ZAK_DB.hlaska ? `<div class="note" style="color:var(--acc)">${esc(ZAK_DB.hlaska)}</div>` : ''}
    <div class="btns noprint" style="margin-bottom:10px">
      <button class="mini" onclick="zakaznikZavri()">← Zpět na seznam</button>
    </div>
    <!-- Dotažení z ARES i tady (21. 8. 2026): vyplní název, sídlo a DIČ podle
         IČO. Nic nepřepíše bez potvrzení — panel ukáže „takhle to je / takhle
         to bude" úplně stejně jako v hlavičce zakázky. -->
    ${typeof aresRadek === 'function' ? aresRadek('zakaznik') : ''}
    ${skupina('Identifikace', ['nazev', 'sidlo', 'ico', 'dic', 'kontaktOsoba', 'zapis', 'banka', 'ucet'])}
    ${skupina('Zástupci a kontakty', ['smluvniJmeno', 'smluvniPozice', 'smluvniTel', 'smluvniEmail',
      'obchodniJmeno', 'obchodniTel', 'obchodniEmail',
      'technickyJmeno', 'technickyTel', 'technickyEmail', 'fakturyEmail', 'fakturyTel'])}
    <h3>Interní poznámka</h3>
    <div class="kl-row"><div class="lbl">Poznámka</div>
      <div><input type="text" value="${esc(z.poznamka || '')}" placeholder="např. platí spolehlivě, jedná přes správce…"
        onchange="zakaznikSet('poznamka', this.value)"></div>
      <div class="src"><span class="note" style="font-size:10px">nikam se netiskne</span></div></div>

    <div class="btns noprint" style="margin-top:14px">
      <button class="primary" ${ZAK_DB.pracuje ? 'disabled' : ''} onclick="zakaznikUloz()">Uložit zákazníka</button>
      <button style="background:#86e8ad;color:#0B2E6B;border-color:#5fcf92"
        onclick="zakaznikDoZakazkyUI('${escJs(klic)}')">Přenést do otevřené zakázky</button>
      ${(!ZAK_DB.novy && typeof jeAdminOnline === 'function' && jeAdminOnline())
        ? `<button class="mini" onclick="zakaznikSmaz()">Smazat kartu…</button>` : ''}
    </div>
    <div class="note" style="margin-top:6px">Klíč záznamu: <code>${esc(klic || '—')}</code>
      ${z.autor ? ' · založil ' + esc(z.autor) : ''}${z.upraven ? ' · upraveno ' + esc(String(z.upraven).slice(0, 10)) : ''}.
      Prázdné pole karty nikdy nic v zakázce nepřepíše.</div>
  </div>`;
}
