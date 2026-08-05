/* ============================================================
 * KONFIGURACE (SET-2) – trvalé uložení nastavení do konfigurace.json
 *
 * Jeden soubor, který nese VŠE, co je nastavení aplikace a co dnes žije
 * jen v paměti relace:
 *   nastaveni    – role, uživatelé, slevové stropy a schémata, viditelnost
 *                  záložek a nákladů, výchozí jazyk dokumentů
 *   specifikace  – číselníky technické specifikace (TS_C) a výchozí hodnoty polí
 *   katalog      – trvalé položky ceníku mimo zakázku (katalog.js)
 *   slovnik      – slovník překladů CZ→EN/DE/FR (preklad.js)
 *   sablony      – jen NÁZVY nahraných .docx šablon (binární obsah se nepřenáší)
 *
 * Zakázka se sem NEUKLÁDÁ – ta má vlastní soubor (StorageAdapter).
 *
 * Export i import smí podle dohodnutého pravidla spouštět POUZE ADMINISTRÁTOR;
 * kontrola role je v UI (nastaveni_ui.js), tento modul je čistá logika bez DOM,
 * aby šel testovat v Node.
 *
 * Import je VÝBĚROVÝ (volby) a mění objekty NA MÍSTĚ – reference z formulářů
 * (TS_C, TECHSPEC_DEF, NAST, KATALOG) tak zůstávají platné a nic se „neodpojí".
 * ============================================================ */

const KONFIG_VERZE = 1;

const KONFIG_SEKCE = [
  { kod: 'nastaveni', nazev: 'Nastavení aplikace (firemní údaje, role, uživatelé, slevy, viditelnost)' },
  { kod: 'specifikace', nazev: 'Data technické specifikace (číselníky a výchozí hodnoty)' },
  { kod: 'katalog', nazev: 'Trvalé položky ceníku (katalog)' },
  { kod: 'slovnik', nazev: 'Slovník překladů (EN / DE / FR)' },
  { kod: 'sablony', nazev: 'Šablony dokumentů – jen názvy souborů' },
];

/* klíče NAST, které do konfigurace patří; jeAdmin a panel jsou stav relace, ne nastavení */
/* `zobrazeni` = matice „co která role vidí" (#136). Do exportu konfigurace
 * patří — administrátor si ji tím odnese i s ostatním nastavením a je z čeho
 * ji obnovit. Do `_nastaveni.json` ale NE (viz NASTDB_NEUKLADAT): jejím
 * domovem je server (/api/zobrazeni), protože obchodník ani vedoucí složku
 * `_DB` nemapují a k pravidlu by se jinak nedostali. Stejná úvaha jako
 * u `slevy`, jejichž domovem je verzovaný `_program.json`. */
const KONFIG_NAST_KLICE = ['tabViditelnost', 'zobrazitNaklady', 'kpiViditelne', 'jazyk',
  'firma', 'role', 'uzivatele', 'slevy', 'zobrazeni'];

/* Struktury, u nichž „klíč chybí" znamená „tenhle přepínač tehdy ještě
 * neexistoval", ne „administrátor ho vypnul". Jen u nich se po importu
 * doplňují chybějící klíče z výchozí struktury aplikace.
 *
 * `firma` tu schválně NENÍ: doplnění chybějících polí z DEFAULT_FIRMA by
 * do skutečných firemních údajů propašovalo ukázkové hodnoty a nabídka by
 * je vytiskla. `role`, `uzivatele` a `slevy.schemata` jsou pole hodnot –
 * tam „chybí" opravdu znamená „smazáno". */
const KONFIG_DOPLNIT_KLICE = ['tabViditelnost', 'kpiViditelne', 'zobrazeni'];

function konfigKopie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

/* Doplní do cíle klíče, které v něm nejsou, podle vzoru. Existující hodnoty
 * nechává být – včetně false, prázdného řetězce a nuly; „vypnuto" je platná
 * odpověď a nesmí se přepsat výchozím „zapnuto".
 *
 * Pole se nedoplňují po prvcích: seznam rolí u prvku matice zobrazení nebo
 * seznam slevových schémat je hodnota jako celek a jeho zkrácení je legitimní
 * nastavení, ne ztráta dat.
 *
 * Vrací tečkové cesty doplněných klíčů, aby import mohl říct, co dorovnal. */
function konfigDoplnChybejici(cil, vzor) {
  if (!cil || !vzor || typeof cil !== 'object' || typeof vzor !== 'object') return [];
  if (Array.isArray(cil) || Array.isArray(vzor)) return [];
  const doplnene = [];
  Object.keys(vzor).forEach(k => {
    if (cil[k] === undefined) {
      cil[k] = konfigKopie(vzor[k]);
      doplnene.push(k);
    } else if (cil[k] && vzor[k] && typeof cil[k] === 'object' && typeof vzor[k] === 'object'
               && !Array.isArray(cil[k]) && !Array.isArray(vzor[k])) {
      konfigDoplnChybejici(cil[k], vzor[k]).forEach(x => doplnene.push(k + '.' + x));
    }
  });
  return doplnene;
}

/* Výchozí podoba NAST. V prohlížeči ji ui/common.js zmrazí do globální
 * NAST_VYCHOZI hned po definici NAST (dřív, než ji stihne cokoli přepsat);
 * v Node testech a v serverovém kódu se předává přes ctx.NASTVychozi.
 * Když není ani jedno, doplňování se prostě přeskočí – import musí projít
 * i tam, kde výchozí struktura není k dispozici. */
function konfigVychoziNast(ctx) {
  if (ctx && ctx.NASTVychozi) return ctx.NASTVychozi;
  if (typeof NAST_VYCHOZI !== 'undefined' && NAST_VYCHOZI) return NAST_VYCHOZI;
  return null;
}

/* Dorovná strukturální klíče NAST po jakémkoli převzetí cizího nastavení
 * (import konfigurace, _DB/_nastaveni.json, matice zobrazení ze serveru).
 * Vrací seznam doplněných cest. */
function konfigDorovnejNast(NAST, ctx) {
  const vzor = konfigVychoziNast(ctx);
  if (!vzor || !NAST) return [];
  const doplnene = [];
  KONFIG_DOPLNIT_KLICE.forEach(k => {
    if (!NAST[k] || typeof NAST[k] !== 'object' || Array.isArray(NAST[k])) return;
    if (!vzor[k] || typeof vzor[k] !== 'object') return;
    konfigDoplnChybejici(NAST[k], vzor[k]).forEach(x => doplnene.push(k + '.' + x));
  });
  return doplnene;
}

/* nahradí obsah cílového objektu/pole NA MÍSTĚ (zachová referenci) */
function konfigNahradVMiste(cil, zdroj) {
  if (Array.isArray(cil) && Array.isArray(zdroj)) {
    cil.length = 0;
    zdroj.forEach(x => cil.push(konfigKopie(x)));
    return cil;
  }
  Object.keys(cil).forEach(k => { delete cil[k]; });
  Object.keys(zdroj || {}).forEach(k => { cil[k] = konfigKopie(zdroj[k]); });
  return cil;
}

/* ---------- EXPORT ---------- */
/* ctx = { NAST, TS_C, TECHSPEC_DEF, KATALOG, SABLONY, build, datum }
 * volby = { nastaveni, specifikace, katalog, slovnik, sablony } – vynechané = vše */
function konfiguraceExport(ctx, volby) {
  ctx = ctx || {};
  const chce = k => !volby || !!volby[k];
  const out = {
    _popis: 'Konfigurace Kalkulátoru OCK (SET-2). Import provádí administrátor v Nastavení → Konfigurace.',
    aplikace: 'Kalkulátor OCK',
    verze: KONFIG_VERZE,
    build: ctx.build || '',
    vytvoreno: ctx.datum || '',
  };

  if (chce('nastaveni') && ctx.NAST) {
    const n = {};
    KONFIG_NAST_KLICE.forEach(k => { if (ctx.NAST[k] !== undefined) n[k] = konfigKopie(ctx.NAST[k]); });
    out.nastaveni = n;
  }

  if (chce('specifikace') && ctx.TS_C) {
    const vychozi = {};
    (ctx.TECHSPEC_DEF || []).forEach(s => s.pole.forEach(p => { if (p.def !== undefined) vychozi[p.id] = p.def; }));
    out.specifikace = { ciselniky: konfigKopie(ctx.TS_C), vychozi };
  }

  if (chce('katalog') && ctx.KATALOG && typeof katalogExport === 'function')
    out.katalog = konfigKopie(katalogExport(ctx.KATALOG));

  if (chce('slovnik') && typeof prekladExport === 'function')
    out.slovnik = konfigKopie(prekladExport());

  if (chce('sablony') && ctx.SABLONY) {
    const s = {};
    Object.keys(ctx.SABLONY).forEach(t => { s[t] = { nazev: (ctx.SABLONY[t] || {}).nazev || '' }; });
    out.sablony = s;   // binární .docx se nepřenáší – po importu se šablony nahrají znovu
  }

  return out;
}

/* ---------- POPIS OBSAHU (pro potvrzovací dialog před importem) ---------- */
function konfiguracePopis(data) {
  if (!data || typeof data !== 'object') return [];
  const radky = [];
  const pocet = o => o ? Object.keys(o).length : 0;
  if (data.nastaveni) radky.push({ kod: 'nastaveni', text: 'Nastavení: '
    + (data.nastaveni.firma ? 'firemní údaje (' + ((data.nastaveni.firma.nazev || '').trim() || 'bez názvu') + '), ' : '')
    + (data.nastaveni.uzivatele ? data.nastaveni.uzivatele.length + ' uživatelů, ' : '')
    + (data.nastaveni.role ? data.nastaveni.role.length + ' rolí' : '') });
  if (data.specifikace) radky.push({ kod: 'specifikace', text: 'Specifikace: '
    + pocet(data.specifikace.ciselniky) + ' číselníků, ' + pocet(data.specifikace.vychozi) + ' výchozích hodnot' });
  if (data.katalog) radky.push({ kod: 'katalog', text: 'Katalog ceníku: '
    + Object.keys(data.katalog.sekce || {}).reduce((a, k) => a + (data.katalog.sekce[k] || []).length, 0) + ' položek' });
  if (data.slovnik) radky.push({ kod: 'slovnik', text: 'Slovník překladů: ' + pocet(data.slovnik.hesla) + ' hesel' });
  if (data.sablony) radky.push({ kod: 'sablony', text: 'Šablony (jen názvy): ' + pocet(data.sablony) });
  return radky;
}

/* ---------- IMPORT ---------- */
/* Vrací { zmeneno: [texty], varovani: [texty] }. Neplatný soubor → výjimka. */
function konfiguraceImport(data, ctx, volby) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch (e) { throw new Error('Soubor není platný JSON: ' + e.message); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Soubor konfigurace není platný objekt.');
  if (data.aplikace && data.aplikace !== 'Kalkulátor OCK')
    throw new Error('Soubor patří jiné aplikaci: ' + data.aplikace);
  if (+data.verze > KONFIG_VERZE)
    throw new Error('Soubor je z novější verze aplikace (verze ' + data.verze + ', tato zná ' + KONFIG_VERZE + ').');
  if (!KONFIG_SEKCE.some(s => data[s.kod]))
    throw new Error('Soubor neobsahuje žádnou známou sekci konfigurace.');

  ctx = ctx || {};
  const chce = k => (!volby || !!volby[k]) && !!data[k];
  const zmeneno = [], varovani = [];

  if (chce('nastaveni') && ctx.NAST) {
    let n = 0;
    KONFIG_NAST_KLICE.forEach(k => {
      if (data.nastaveni[k] === undefined) return;
      if (ctx.NAST[k] && typeof ctx.NAST[k] === 'object') konfigNahradVMiste(ctx.NAST[k], data.nastaveni[k]);
      else ctx.NAST[k] = konfigKopie(data.nastaveni[k]);
      n++;
    });
    /* Zjednodušení rolí (2. 8. 2026): starší konfigurace nese čtyři role.
     * Migruje se hned při importu, ať se nikde neukáže rozbalovací seznam
     * s rolí, která už neexistuje. */
    if (typeof roleMigrujSeznam === 'function' && Array.isArray(ctx.NAST.role))
      ctx.NAST.role = roleMigrujSeznam(ctx.NAST.role);
    if (typeof roleMigruj === 'function' && Array.isArray(ctx.NAST.uzivatele))
      ctx.NAST.uzivatele.forEach(u => { if (u && u.role) u.role = roleMigruj(u.role); });
    if (typeof stropyMigruj === 'function' && ctx.NAST.slevy && ctx.NAST.slevy.stropy)
      ctx.NAST.slevy.stropy = stropyMigruj(ctx.NAST.slevy.stropy);
    /* Konfigurace uložená starší verzí nezná přepínače, které tehdy
     * neexistovaly. Protože konfigNahradVMiste() nahrazuje obsah celý,
     * bez tohohle dorovnání by po importu zmizely – přesně takhle přišel
     * uživatel 5. 8. 2026 o záložku „Schvalování slev". */
    const doplneno = konfigDorovnejNast(ctx.NAST, ctx);
    if (doplneno.length) varovani.push('konfigurace je z dřívější verze a neznala: '
      + doplneno.join(', ') + ' – doplněno výchozím nastavením');
    zmeneno.push('nastavení aplikace (' + n + ' oddílů)');
    if (data.nastaveni.jeAdmin !== undefined) varovani.push('role administrátora se z konfigurace nepřebírá (bezpečnost)');
  }

  if (chce('specifikace') && ctx.TS_C) {
    const c = data.specifikace.ciselniky || {};
    let zn = 0, nove = 0;
    Object.keys(c).forEach(k => {
      if (Array.isArray(ctx.TS_C[k])) { konfigNahradVMiste(ctx.TS_C[k], c[k]); zn++; }
      else { ctx.TS_C[k] = konfigKopie(c[k]); nove++; }
    });
    const v = data.specifikace.vychozi || {};
    let vd = 0;
    (ctx.TECHSPEC_DEF || []).forEach(s => s.pole.forEach(p => {
      if (Object.prototype.hasOwnProperty.call(v, p.id)) { p.def = v[p.id]; vd++; }
    }));
    zmeneno.push('data specifikace (' + zn + ' číselníků' + (nove ? ', ' + nove + ' nových' : '') + ', ' + vd + ' výchozích hodnot)');
    const nezname = Object.keys(v).filter(id => !(ctx.TECHSPEC_DEF || [])
      .some(s => s.pole.some(p => p.id === id)));
    if (nezname.length) varovani.push('neznámé pozice specifikace se přeskočily: ' + nezname.join(', '));
  }

  if (chce('katalog') && ctx.KATALOG && typeof katalogImport === 'function') {
    katalogImport(ctx.KATALOG, data.katalog);
    zmeneno.push('katalog ceníku (' + (typeof katalogPocet === 'function' ? katalogPocet(ctx.KATALOG) : '?') + ' položek)');
  }

  if (chce('slovnik') && typeof prekladImport === 'function') {
    prekladImport(data.slovnik);
    zmeneno.push('slovník překladů (' + Object.keys(data.slovnik.hesla || {}).length + ' hesel)');
  }

  if (chce('sablony') && data.sablony) {
    const jmena = Object.keys(data.sablony).map(t => data.sablony[t].nazev).filter(Boolean);
    if (jmena.length) varovani.push('šablony se přenášejí jen názvem – nahrajte znovu: ' + jmena.join(', '));
  }

  return { zmeneno, varovani };
}

/* název souboru pro stažení */
function konfiguraceNazevSouboru(build) {
  return 'konfigurace' + (build ? '_' + String(build).replace(/[^\w.]+/g, '') : '') + '.json';
}

if (typeof module !== 'undefined')
  module.exports = { KONFIG_VERZE, KONFIG_SEKCE, KONFIG_NAST_KLICE, KONFIG_DOPLNIT_KLICE,
    konfiguraceExport, konfiguraceImport, konfiguracePopis, konfiguraceNazevSouboru,
    konfigNahradVMiste, konfigDoplnChybejici, konfigDorovnejNast };
