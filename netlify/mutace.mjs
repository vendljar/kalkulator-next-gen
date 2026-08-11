/* ============================================================
 * MUTAČNÍ TESTOVÁNÍ SERVEROVÉ VRSTVY (bezpečnostní audit 5. 8. 2026)
 *
 * PROČ TOHLE EXISTUJE
 *
 * Zelená sada testů říká jen tolik, že testy prošly. Neříká, jestli by
 * zčervenaly, kdyby se kód rozbil — a přesně to je otázka, na které záleží.
 * Test, který projde vždycky, je horší než žádný: dělá dojem, že se hlídá
 * něco, co se nehlídá.
 *
 * Tenhle nástroj proto kód schválně rozbíjí. Vezme jedno místo v serverové
 * funkci, provede v něm PRÁVĚ JEDNU záměnu (typicky vypne nějakou kontrolu),
 * spustí obě serverové sady a čeká, že aspoň jedna spadne. Když spadne,
 * mutace je „chycená" a víme, že kontrolu opravdu někdo hlídá. Když projde,
 * je to díra v testech: tuhle chybu by nikdo nezachytil — ani při nasazení.
 * Původní znění souboru se hned vrátí zpátky (i při přerušení), takže po
 * doběhnutí je pracovní kopie beze změny.
 *
 * JAK TO ČÍST
 *   chycená    … někdo tu kontrolu hlídá, dobře
 *   NECHYCENÁ  … testům chybí kontrola právě tohohle; buď se doplní test,
 *                nebo se vědomě zapíše, proč se to nehlídá
 *
 * Spouští se `node netlify/mutace.mjs` (volitelně s částí názvu mutace
 * jako filtrem, např. `node netlify/mutace.mjs relace`).
 * ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = dirname(fileURLToPath(import.meta.url));
const SADY = ['test_prava.mjs', 'test_funkce.mjs'];
const filtr = (process.argv[2] || '').toLowerCase();

/* Každá mutace: soubor, hledaný úsek (musí být v souboru PRÁVĚ JEDNOU),
 * čím se nahradí, a proč nás zajímá — co by se v praxi stalo, kdyby tuhle
 * chybu někdo udělal doopravdy. */
const MUTACE = [
  /* ---------- relace a hesla (lib/sdilene.mjs) ---------- */
  { nazev: 'podpis relace se neověřuje', soubor: 'lib/sdilene.mjs',
    hledej: 'if (!telo || !pod || podpis(telo) !== pod) return null;',
    nahrad: 'if (!telo) return null;',
    proc: 'kdokoli by si napsal vlastní cookie a byl administrátorem' },

  { nazev: 'platnost relace se neověřuje', soubor: 'lib/sdilene.mjs',
    hledej: 'return (r.exp > Date.now()) ? r : null;',
    nahrad: 'return r;',
    proc: 'dvanáctihodinový limit by neplatil, stará cookie by fungovala napořád' },

  { nazev: 'heslo se neporovnává', soubor: 'lib/sdilene.mjs',
    hledej: 'return timingSafeEqual(Buffer.from(hash, \'hex\'), b);',
    nahrad: 'return true;',
    proc: 'dovnitř by se dostal každý, kdo zná e-mail' },

  { nazev: 'heslo se porovnává obyčejně, ne časově bezpečně', soubor: 'lib/sdilene.mjs',
    hledej: 'return timingSafeEqual(Buffer.from(hash, \'hex\'), b);',
    nahrad: 'return hash === b.toString(\'hex\');',
    proc: 'z délky odpovědi by šlo heslo uhodnout po znacích' },

  { nazev: 'heslo se ukládá v čitelné podobě', soubor: 'lib/sdilene.mjs',
    hledej: 'return sul + \':\' + hash;',
    nahrad: 'return sul + \':\' + Buffer.from(String(heslo)).toString(\'hex\');',
    proc: 'kdo se dostane k databázi, přečte si všechna hesla' },

  { nazev: 'sůl hesla je pro všechny stejná', soubor: 'lib/sdilene.mjs',
    hledej: 'const sul = randomBytes(16).toString(\'hex\');',
    nahrad: 'const sul = \'0000000000000000\';',
    proc: 'stejná hesla by měla stejný otisk a daly by se lámat hromadně' },

  { nazev: 'tajemství relace má zapsanou náhradu v kódu', soubor: 'lib/sdilene.mjs',
    hledej: '  const t = process.env.TAJEMSTVI_RELACE;',
    nahrad: '  const t = process.env.TAJEMSTVI_RELACE || \'zalozni-tajemstvi-v-kodu\';',
    proc: 'tajemství v repozitáři si přečte každý, kdo vidí zdrojáky' },

  /* ---------- ověřování práv (lib/sdilene.mjs) ---------- */
  { nazev: 'role se nekontroluje', soubor: 'lib/sdilene.mjs',
    hledej: '  if (role.length && !role.includes(relace.role))',
    nahrad: '  if (false && !role.includes(relace.role))',
    proc: 'obchodník by stáhl celou databázi i zveřejnil ceník' },

  { nazev: 'vypnutý účet se nepozná', soubor: 'lib/sdilene.mjs',
    hledej: '  if (ucet.aktivni === false)',
    nahrad: '  if (false)',
    proc: 'kolega, který odešel, pracuje dál až do vypršení cookie' },

  { nazev: 'smazaný účet projde', soubor: 'lib/sdilene.mjs',
    hledej: '  if (!ucet)\n    return { chyba: json({ ok: false, chyba: \'Účet už neexistuje. Přihlaste se znovu.\' }, 401) };',
    nahrad: '  if (!ucet) return { relace: r };',
    proc: 'relace na zrušený účet by dál platila' },

  { nazev: 'role se bere z cookie, ne z účtu', soubor: 'lib/sdilene.mjs',
    hledej: '  const relace = { ...r, ...profilZUctu(ucet), email: r.email, role: ucet.role };',
    nahrad: '  const relace = { ...profilZUctu(ucet), ...r, email: r.email };',
    proc: 'sražená role platí až za dvanáct hodin — přesně naopak, než je potřeba' },

  /* ---------- přihlášení (functions/prihlaseni.mjs) ---------- */
  { nazev: 'přihlášení nekontroluje heslo', soubor: 'functions/prihlaseni.mjs',
    hledej: '  const pustit = !!ucet && ucet.aktivni !== false && sedi;',
    nahrad: '  const pustit = !!ucet && ucet.aktivni !== false;',
    proc: 'stačilo by znát e-mail kolegy' },

  { nazev: 'přihlásí se i vypnutý účet', soubor: 'functions/prihlaseni.mjs',
    hledej: '  const pustit = !!ucet && ucet.aktivni !== false && sedi;',
    nahrad: '  const pustit = !!ucet && sedi;',
    proc: 'vypnutí účtu by nic neznamenalo' },

  /* ---------- brzda proti hádání hesel a čas odpovědi (#92, #93) ---------- */
  { nazev: 'brzda pustí neomezený počet pokusů', soubor: 'functions/prihlaseni.mjs',
    hledej: '  if (stav.n > POKUSY_MAX)',
    nahrad: '  if (false)',
    proc: 'hádání hesel by nic nezpomalilo a nikde by po něm nezůstala stopa' },

  { nazev: 'úspěšné přihlášení nevynuluje počítadlo', soubor: 'functions/prihlaseni.mjs',
    hledej: '    await pokusyReset(email);',
    nahrad: '    ;',
    proc: 'po deseti překlepech za den by se člověk nepřihlásil ani se správným heslem' },

  { nazev: 'brzda předběhne ověření hesla', soubor: 'functions/prihlaseni.mjs',
    hledej: '  const pustit = !!ucet && ucet.aktivni !== false && sedi;\n\n  if (pustit) {',
    nahrad: '  const pustit = !!ucet && ucet.aktivni !== false && sedi\n    && (await pokusyStav(email)).n <= POKUSY_MAX;\n\n  if (pustit) {',
    proc: 'útočník by deseti špatnými pokusy zamkl majitele účtu — i hlavního administrátora' },

  { nazev: 'u neznámého účtu se scrypt nepočítá', soubor: 'functions/prihlaseni.mjs',
    hledej: '  const sedi = hesloSedi(heslo, (ucet && ucet.heslo) ? ucet.heslo : FALESNY_OTISK);',
    nahrad: '  const sedi = (ucet && ucet.heslo) ? hesloSedi(heslo, ucet.heslo) : false;',
    proc: 'z času odpovědi by šlo přečíst, které e-maily v databázi jsou' },

  /* ---------- archivace účtů a převod zakázek (11. 8. 2026) ---------- */
  { nazev: 'archivovaný účet se pořád přihlásí', soubor: 'functions/uzivatele.mjs',
    hledej: '        ucet.aktivni = false;          // archivovaný účet se nikdy nepřihlásí',
    nahrad: '        ;',
    proc: 'účet po odcházejícím kolegovi by zmizel ze seznamu, ale dveře by mu zůstaly otevřené' },

  { nazev: 'autor zakázky se přepíše každým uložením', soubor: 'functions/zakazky.mjs',
    hledej: '  if (!zak.autor) zak.autor = relace.email;',
    nahrad: '  zak.autor = relace.email;',
    proc: 'autorem by se stal ten, kdo si zakázku naposledy otevřel — razítko by ztratilo smysl' },

  { nazev: 'zakázky jde převést i na archivovaný účet', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (cil.aktivni === false || cil.archiv)',
    nahrad: '      if (false)',
    proc: 'práce po odcházejícím kolegovi by se ztratila podruhé — u dalšího neexistujícího účtu' },

  /* ---------- mazání účtů (11. 8. 2026) ----------
   *
   * Mazání je jediná nevratná akce nad účtem, takže se rozbíjí přesně to,
   * co by v praxi nikdo nepoznal dřív než pozdě: účet, který „zmizel", ale
   * dveře mu zůstaly otevřené; pojistka na hlavním účtu; a odmítnutí, které
   * účet chrání, dokud po něm nepřevezme práci někdo jiný. */
  { nazev: 'smazaný účet se pořád přihlásí', soubor: 'functions/uzivatele.mjs',
    hledej: '      await u.zapis(email, null);          // náhrobek: klíč zůstane, účet ne',
    nahrad: '      ;',
    proc: 'účet by zmizel ze seznamu, ale přihlásil by se i dál — mazání by bylo jen naoko' },

  { nazev: 'hlavní účet jde smazat', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (email === ADMIN_EMAIL)\n',
    nahrad: '      if (false)\n',
    proc: 'jedním kliknutím by zmizel účet, kterým se aplikace spravuje — a zpátky ho nikdo nevrátí' },

  { nazev: 'účet se zakázkami se smaže bez převodu', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (moje.length && !iSeZakazkami)',
    nahrad: '      if (false)',
    proc: 'zakázky by zůstaly podepsané e-mailem, který už neexistuje, a nikdo by nevěděl, čí jsou' },

  { nazev: 'podpis smazaného účtu zůstane na serveru', soubor: 'functions/uzivatele.mjs',
    hledej: '      try { await (await uloziste(PODPIS_ULOZISTE)).zapis(email, null); }',
    nahrad: '      try { if (false) await (await uloziste(PODPIS_ULOZISTE)).zapis(email, null); }',
    proc: 'na serveru by ležel sken podpisu člověka, který v aplikaci není — a zdědil by ho ten, kdo dostane stejný e-mail' },

  /* ---------- sdílený rejstřík žádostí o slevu (#102) ---------- */
  { nazev: 'rejstřík žádostí je veřejný', soubor: 'functions/schvalovani.mjs',
    hledej: '  const { chyba } = await vyzadujRoli(req);      // stačí být přihlášen',
    nahrad: '  const { chyba } = { chyba: null };',
    proc: 'kdokoli zvenčí by si vytáhl seznam zakázek i s procenty slev' },

  { nazev: 'rejstřík vydá i částky ze zakázky', soubor: 'functions/schvalovani.mjs',
    hledej: '    out.push({\n      klic,',
    nahrad: '    out.push({\n      cenaPoSleve: (v.data && v.data.sleva && v.data.sleva.cenaPoSleve) || null,\n      klic,',
    proc: 'přehled napříč zakázkami by obešel matici zobrazení — cenu by uviděl i ten, komu ji správce nedal' },

  /* ---------- hlavní účet pozná server, ne prohlížeč (#95) ---------- */
  { nazev: 'seznam účtů neřekne, který je hlavní', soubor: 'functions/uzivatele.mjs',
    hledej: 'aktivni: x.aktivni !== false, hlavni: x.email === ADMIN_EMAIL,',
    nahrad: 'aktivni: x.aktivni !== false,',
    proc: 'prohlížeč by musel adresu znát sám — a měl by ji ve zdrojácích podruhé' },

  { nazev: 'zaváděcí heslo administrátora se nekontroluje', soubor: 'functions/prihlaseni.mjs',
    hledej: '      && heslo === process.env.ADMIN_INIT_HESLO) {',
    nahrad: '      ) {',
    proc: 'první administrátorský účet by si založil kdokoli s jakýmkoli heslem' },

  { nazev: 'cookie relace není HttpOnly', soubor: 'functions/prihlaseni.mjs',
    hledej: '+ \'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200\'',
    nahrad: '+ \'; Secure; SameSite=Lax; Path=/; Max-Age=43200\'',
    proc: 'cizí skript na stránce by relaci přečetl a odnesl' },

  { nazev: 'cookie relace není Secure', soubor: 'functions/prihlaseni.mjs',
    hledej: '+ \'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200\'',
    nahrad: '+ \'; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200\'',
    proc: 'relace by šla i po nešifrovaném spojení, kde ji lze odposlechnout' },

  { nazev: 'cookie relace nemá SameSite', soubor: 'functions/prihlaseni.mjs',
    hledej: '+ \'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200\'',
    nahrad: '+ \'; HttpOnly; Secure; Path=/; Max-Age=43200\'',
    proc: 'cizí stránka by uměla poslat požadavek za přihlášeného uživatele' },

  { nazev: 'cookie relace nemá omezenou platnost', soubor: 'functions/prihlaseni.mjs',
    hledej: '+ \'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200\'',
    nahrad: '+ \'; HttpOnly; Secure; SameSite=Lax; Path=/\'',
    proc: 'cookie by v prohlížeči zůstala napořád' },

  { nazev: 'relace věří roli poslané v těle přihlášení', soubor: 'functions/prihlaseni.mjs',
    hledej: 'relaceVytvor(ucet.email, ucet.role)',
    nahrad: 'relaceVytvor(ucet.email, (await req.clone().json().catch(() => ({}))).role || ucet.role)',
    proc: 'kdo si přidá do přihlášení „role: Administrátor", tím se stane' },

  /* ---------- správa účtů (functions/uzivatele.mjs) ---------- */
  { nazev: 'správu účtů zvládne kdokoli (POST)', soubor: 'functions/uzivatele.mjs',
    hledej: '    if (relace.role !== \'Administrátor\')\n      return json({ ok: false, chyba: \'K této akci je potřeba role: Administrátor.\' }, 403);',
    nahrad: '    if (false) return json({ ok: false }, 403);',
    proc: 'obchodník by si sám povýšil roli nebo přepsal cizí heslo' },

  { nazev: 'seznam kolegů vidí kdokoli (GET)', soubor: 'functions/uzivatele.mjs',
    hledej: '  if (relace.role !== \'Administrátor\')\n    return json({ ok: false, chyba: \'K této akci je potřeba role: Administrátor.\' }, 403);\n  const klice = await u.seznam();',
    nahrad: '  const klice = await u.seznam();',
    proc: 'kdokoli by si vytáhl seznam zaměstnanců i s rolemi' },

  { nazev: 'seznam účtů vydá i otisky hesel', soubor: 'functions/uzivatele.mjs',
    hledej: '    if (x && !x.smazano) out.push({ email: x.email, jmeno: x.jmeno, titul: x.titul || \'\',',
    nahrad: '    if (x) out.push(x); if (false) out.push({ email: x.email, jmeno: x.jmeno, titul: x.titul || \'\',',
    proc: 'otisky hesel by se daly lámat mimo server' },

  { nazev: 'vlastní heslo jde změnit bez znalosti starého', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (!hesloSedi(String(t.stare || \'\'), ucet.heslo))',
    nahrad: '      if (false)',
    proc: 'kdo sedne k odemčenému počítači, ukradne účet natrvalo' },

  { nazev: 'heslo smí být kratší než osm znaků', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (!t.nove || String(t.nove).length < 8)',
    nahrad: '      if (!t.nove)',
    proc: 'jednoznakové heslo se uhodne hned' },

  { nazev: 'hlavní administrátor jde vypnout', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (email === ADMIN_EMAIL && t.aktivni === false)',
    nahrad: '      if (false)',
    proc: 'firma by si zamkla dveře od vlastní databáze' },

  { nazev: 'hlavnímu administrátorovi jde snížit role', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (email === ADMIN_EMAIL && t.role !== \'Administrátor\')',
    nahrad: '      if (false)',
    proc: 'totéž jinou cestou — nikdo by už nemohl spravovat účty' },

  { nazev: 'zakládá se účet s neznámou rolí', soubor: 'functions/uzivatele.mjs',
    hledej: '      if (!ROLE.includes(t.role)) return json({ ok: false, chyba: \'Neznámá role.\' }, 400);\n      if (!t.heslo',
    nahrad: '      if (!t.heslo',
    proc: 'účet s vymyšlenou rolí by se choval nepředvídatelně' },

  /* ---------- ceník a firma ---------- */
  { nazev: 'ceník zveřejní kdokoli', soubor: 'functions/program.mjs',
    hledej: 'const { chyba, relace } = await vyzadujRoli(req, \'Administrátor\');',
    nahrad: 'const { chyba, relace } = await vyzadujRoli(req);',
    proc: 'obchodník by si zvedl ceny nebo je omylem přepsal všem' },

  { nazev: 'ceník přečte i nepřihlášený', soubor: 'functions/program.mjs',
    hledej: '    const { chyba } = await vyzadujRoli(req);          // stačí být přihlášen\n    if (chyba) return chyba;',
    nahrad: '',
    proc: 'naše nákladové ceny by si stáhl kdokoli z internetu' },

  { nazev: 'firemní údaje zveřejní kdokoli', soubor: 'functions/firma.mjs',
    hledej: '  const { chyba, relace } = await vyzadujRoli(req, \'Administrátor\');',
    nahrad: '  const { chyba, relace } = await vyzadujRoli(req);',
    proc: 'kdokoli by přepsal hlavičku všech odesílaných nabídek' },

  { nazev: 'ukázková firma projde jako skutečná', soubor: 'functions/firma.mjs',
    hledej: '  const lze = fm.firmaLzeZverejnit(t.udaje || null);\n  if (!lze.ok) return json({ ok: false, chyba: lze.duvod }, 400);\n  const udaje = fm.firmaKZverejneni(t.udaje);',
    nahrad: '  const udaje = fm.firmaKZverejneni(t.udaje);\n  const lze = fm.firmaLzeZverejnit(udaje);\n  if (!lze.ok) return json({ ok: false, chyba: lze.duvod }, 400);',
    proc: 'nabídka by odešla s vymyšlenou adresou v hlavičce' },

  /* ---------- zakázky ---------- */
  { nazev: 'zakázky čte i nepřihlášený', soubor: 'functions/zakazky.mjs',
    hledej: '  const { chyba, relace } = await vyzadujRoli(req);\n  if (chyba) return chyba;',
    nahrad: '  const relace = { email: \'\' };',
    proc: 'obsah zakázek zákazníků by byl veřejný' },

  { nazev: 'jméno souboru se bere, jak přijde', soubor: 'functions/zakazky.mjs',
    hledej: '    const zak = await s.cti(\'z/\' + soubor);',
    nahrad: '    const zak = await s.cti(soubor);',
    proc: 'požadavkem na „_rejstrik" nebo cestou ven by šlo číst cizí záznamy' },

  { nazev: 'uzamčenou nabídku lze přepsat', soubor: 'functions/zakazky.mjs',
    hledej: '    const k = ULO.uloKontrolaZamku(stara, zak);\n    if (!k.ok)',
    nahrad: '    const k = ULO.uloKontrolaZamku(stara, zak);\n    if (false)',
    proc: 'odeslaná nabídka by se dala tiše změnit — a zákazník má jinou verzi' },

  { nazev: 'data uzamčené varianty lze změnit', soubor: 'functions/zakazky.mjs',
    hledej: '      if (nv && JSON.stringify(nv.data) !== JSON.stringify(sv.data))',
    nahrad: '      if (false)',
    proc: 'zámek by zůstal, ale ceny pod ním by se změnily' },

  /* ---------- zálohy ---------- */
  { nazev: 'zálohu stáhne kdokoli', soubor: 'functions/zaloha.mjs',
    hledej: '  const { chyba } = await vyzadujRoli(req, \'Administrátor\');',
    nahrad: '  const { chyba } = await vyzadujRoli(req);',
    proc: 'celá databáze firmy jedním požadavkem' },

  { nazev: 'záloha veze i otisky hesel', soubor: 'functions/zaloha.mjs',
    hledej: '    if (x) uzivatele.push({ email: x.email, jmeno: x.jmeno, role: x.role, aktivni: x.aktivni !== false });',
    nahrad: '    if (x) uzivatele.push(x);',
    proc: 'soubor zálohy na Disku by nesl hesla všech kolegů' },

  { nazev: 'vynucenou zálohu spustí kdokoli', soubor: 'functions/zaloha_vynuceno.mjs',
    hledej: '  const { chyba, relace } = await vyzadujRoli(req, \'Administrátor\');',
    nahrad: '  const { chyba, relace } = await vyzadujRoli(req);',
    proc: 'kdokoli by nám mohl zaplnit úložiště otisky' },

  /* ---------- ostatní cesty ---------- */
  { nazev: 'výpočet běží bez přihlášení', soubor: 'functions/vypocet.mjs',
    hledej: '  const { chyba } = await vyzadujRoli(req);\n  if (chyba) return chyba;',
    nahrad: '',
    proc: 'cizí strojový čas na náš účet a pohled do vnitřku výpočtu' },

  { nazev: '/api/ja nekontroluje stav účtu', soubor: 'functions/ja.mjs',
    hledej: '  const { chyba, relace, ucet } = await vyzadujRoli(req);\n  if (chyba) return chyba;',
    nahrad: '  const relace = await (await import(\'../lib/sdilene.mjs\')).prihlaseny(req);\n  if (!relace) return json({ ok: false, chyba: \'Nepřihlášen.\' }, 401);\n  const ucet = { email: relace.email };',
    proc: 'vypnutý účet by po obnovení stránky pořád vypadal jako přihlášený' },

  { nazev: '/api/zdravi prozradí prostředí serveru', soubor: 'functions/zdravi.mjs',
    hledej: 'cas: new Date().toISOString(), beh: \'netlify\' });',
    nahrad: 'cas: new Date().toISOString(), beh: \'netlify\', prostredi: process.env });',
    proc: 'veřejná cesta by vydala tajemství relace i zaváděcí heslo' },

  { nazev: 'noční záloha dostane veřejnou cestu', soubor: 'functions/zaloha_nocni.mjs',
    hledej: 'export const config = {',
    nahrad: 'export const config = { path: \'/api/zaloha_nocni\',',
    proc: 'plánovanou zálohu by šlo spouštět z internetu bez přihlášení' },
];

/* ---------- běh ---------- */
function spustSady() {
  for (const sada of SADY) {
    try {
      const vystup = execFileSync('node', [resolve(KOREN, sada)],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
          env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '' } });
      const m = /(\d+) prošlo, (\d+) selhalo/.exec(vystup);
      if (!m) return { chycena: true, kde: sada + ' (sada nedoběhla do souhrnu)' };
      if (Number(m[2]) > 0) return { chycena: true, kde: sada + ': ' + m[2] + ' selhalo' };
    } catch (e) {
      /* Pád sady je taky chycení — mutace rozbila kód tak, že se nedá ani
       * dojít na konec. Tichý průchod je jediná špatná odpověď. */
      return { chycena: true, kde: sada + ' (spadla)' };
    }
  }
  return { chycena: false };
}

const vybrane = MUTACE.filter(m => !filtr
  || m.nazev.toLowerCase().includes(filtr) || m.soubor.toLowerCase().includes(filtr));

console.log('MUTAČNÍ TESTOVÁNÍ SERVEROVÉ VRSTVY');
console.log('Mutací k ověření: ' + vybrane.length + '   (sady: ' + SADY.join(', ') + ')\n');

/* Nejdřív se ověří, že je před zásahem všechno zelené — jinak by „chycená"
 * mutace znamenala jen to, že testy padaly už předtím. */
const vychozi = spustSady();
if (vychozi.chycena) {
  console.log('PŘERUŠENO: sady nejsou zelené ani bez mutace — ' + vychozi.kde);
  process.exit(1);
}
console.log('Výchozí stav: obě sady zelené.\n');

let chycene = 0;
const nechycene = [];
const chybne = [];

for (const m of vybrane) {
  const cesta = resolve(KOREN, m.soubor);
  const puvodni = readFileSync(cesta, 'utf8');
  const pocet = puvodni.split(m.hledej).length - 1;
  if (pocet !== 1) {
    chybne.push(m.nazev + ' — hledaný úsek v ' + m.soubor + ' nalezen ' + pocet + '×');
    console.log('CHYBA ZADÁNÍ  ' + m.nazev + ' (úsek nalezen ' + pocet + '×)');
    continue;
  }
  try {
    writeFileSync(cesta, puvodni.replace(m.hledej, m.nahrad), 'utf8');
    const v = spustSady();
    if (v.chycena) { chycene++; console.log('chycená      ' + m.nazev + '   → ' + v.kde); }
    else { nechycene.push(m); console.log('NECHYCENÁ    ' + m.nazev + '   → ' + m.proc); }
  } finally {
    writeFileSync(cesta, puvodni, 'utf8');       // vrátit vždy, i při pádu
  }
}

console.log('\n============================================================');
console.log('Chycených ' + chycene + ' z ' + (chycene + nechycene.length)
  + (chybne.length ? '   (chybně zadaných mutací: ' + chybne.length + ')' : ''));
if (nechycene.length) {
  console.log('\nNECHYCENÉ MUTACE — tohle by dnes testy nezachytily:');
  for (const m of nechycene) console.log(' - ' + m.nazev + ' (' + m.soubor + ')\n     ' + m.proc);
}
if (chybne.length) {
  console.log('\nCHYBNĚ ZADANÉ MUTACE (kód se změnil, mutace se nenašla):');
  for (const c of chybne) console.log(' - ' + c);
}
process.exitCode = (nechycene.length || chybne.length) ? 1 : 0;
