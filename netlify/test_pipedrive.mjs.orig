/* ============================================================
 * ČTECÍ ČÁST NAPOJENÍ NA PIPEDRIVE (9. 8. 2026, #16)
 *
 * Testuje se proti NÁHRADNÍMU `fetch`, ne proti skutečnému Pipedrive.
 * Důvody jsou tři: sada musí běžet i bez tokenu (a token v repozitáři není),
 * skutečné volání by ujídalo denní rozpočet tokenů, a hlavně — chceme umět
 * vyrobit situace, které se na živém účtu vyrábějí špatně: vyčerpaný limit,
 * spadlou síť, přejmenované pole, deal bez organizace.
 *
 * Náhradní `fetch` si pamatuje, na co se ptalo. Díky tomu jde ověřit i to,
 * co by jinak bylo nevidět: že se mapa polí opravdu cachuje a že se token
 * posílá v hlavičce, ne v adrese (v adrese by se zapsal do logů proxy).
 * ============================================================ */
process.env.TAJEMSTVI_RELACE = 'testovaci-tajemstvi-jen-pro-lokalni-beh';
process.env.ADMIN_INIT_HESLO = 'Docasne.Heslo.123';

const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) { return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
    .map(x => x.slice(nazev.length + 1)); },
});

import prihlaseni from './functions/prihlaseni.mjs';
import uzivatele from './functions/uzivatele.mjs';
import pdPole from './functions/pd_pole.mjs';
import pdDealy from './functions/pd_dealy.mjs';
import pdDeal from './functions/pd_deal.mjs';
import { ADMIN_EMAIL } from './lib/sdilene.mjs';
import { pdCisloZNazvu, pdNazevAkce, pdMapaZPoli, pdHodnota, pdZbytekDoSta,
         pdDealNaNase, POLE_DEALU, POLE_ORGANIZACE } from './lib/pd_mapa.mjs';
import { pdZaklad, pdOdkazNaDeal, PD_TOKEN_PROMENNA, PD_DOMENA_PROMENNA } from './lib/pipedrive.mjs';

let ok = 0, fail = 0; const selhalo = [];
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; selhalo.push(n); console.log('FAIL ' + n, info === undefined ? '' : info); }
};
const get = (fn, url, cookie) => fn(new Request(url, { headers: cookie ? { cookie } : {} }));
const post = (fn, url, telo, cookie) => fn(new Request(url, { method: 'POST',
  headers: cookie ? { cookie } : {}, body: JSON.stringify(telo) }));

/* ---------- náhradní Pipedrive ---------- */

const HASH = {
  splatnost: 'a'.repeat(40),
  zaloha: 'b'.repeat(40),
  faktura2: 'c'.repeat(40),
  adresa: 'd'.repeat(40),
  termin: 'e'.repeat(40),
  typ: 'f'.repeat(40),
  firma: '1'.repeat(40),
  osoba: '2'.repeat(40),
  zaruka: '3'.repeat(40),
  pokuta: '4'.repeat(40),
  zadrzne: '5'.repeat(40),
  neznamé: '9'.repeat(40),
  ico: '7'.repeat(40),
  typOrg: '8'.repeat(40),
};

const POLE_ODPOVED = [
  { key: HASH.splatnost, name: 'Splatnost faktur (dny)', field_type: 'double', edit_flag: true },
  { key: HASH.zaloha, name: 'Záloha %', field_type: 'double', edit_flag: true },
  { key: HASH.faktura2, name: 'Dílčí faktura 2 %', field_type: 'double', edit_flag: true },
  { key: HASH.adresa, name: 'Adresa stavby', field_type: 'varchar', edit_flag: true },
  { key: HASH.termin, name: 'Termín realizace', field_type: 'date', edit_flag: true },
  { key: HASH.typ, name: 'Typ zakázky', field_type: 'enum', edit_flag: true,
    options: [{ id: 54, label: 'Projekce - Výtah + OCK' }, { id: 55, label: 'Realizace' }] },
  { key: HASH.firma, name: 'Objednatel (výtahová firma)', field_type: 'org', edit_flag: true },
  { key: HASH.osoba, name: 'Kontakt objednatele', field_type: 'people', edit_flag: true },
  { key: HASH.zaruka, name: 'Záruka měsíců', field_type: 'double', edit_flag: true },
  { key: HASH.pokuta, name: 'Smluvní pokuta % den', field_type: 'double', edit_flag: true },
  { key: HASH.zadrzne, name: 'Zádržné VaN', field_type: 'enum', edit_flag: true,
    options: [{ id: 71, label: 'Ne' }, { id: 72, label: '10%' }] },
  { key: HASH.neznamé, name: 'Interní příznak XYZ', field_type: 'varchar', edit_flag: true },
  { key: 'title', name: 'Title', field_type: 'varchar', edit_flag: false },
];

const POLE_ORG_ODPOVED = [
  { key: HASH.ico, name: 'IČO', field_type: 'double', edit_flag: true },
  { key: HASH.typOrg, name: 'Typ organizace', field_type: 'enum', edit_flag: true,
    options: [{ id: 1, label: 'Výtahová společnost' }] },
];

const DEAL = (id, nazev, extra = {}) => ({
  id, title: nazev, value: 487500, currency: 'CZK', status: 'open',
  stage_id: 23, org_id: 900, person_id: 800, update_time: '2026-08-01T10:00:00Z',
  custom_fields: {
    [HASH.splatnost]: 14, [HASH.zaloha]: 50, [HASH.faktura2]: 40,
    [HASH.adresa]: 'Zkušební 12, Zkušebín', [HASH.termin]: '2027-03-31',
    [HASH.typ]: { id: 54, label: 'Projekce - Výtah + OCK' },
    [HASH.firma]: 901, [HASH.osoba]: 801,
    ...extra,
  },
});

const DEALY = [
  DEAL(1, 'CN-84 Zkušební ulice 1, Zkušebín'),
  DEAL(2, 'CN-85 Náměstí Bořivojovo 3'),
  { ...DEAL(3, 'OPR12-2025 Oprava zkušební'), status: 'won' },
  { ...DEAL(4, 'Bez čísla — jen popis'), status: 'lost' },
];

const ORGANIZACE = {
  900: { id: 900, name: 'Investor zkušební a.s.', custom_fields: { [HASH.ico]: 11111111 } },
  901: { id: 901, name: 'Výtahy Zkušební s.r.o.', custom_fields: { [HASH.ico]: 12345678 } },
};
const OSOBY = {
  800: { id: 800, first_name: 'Jan', last_name: 'Investorský', emails: [], phones: [] },
  801: { id: 801, first_name: 'Jan', last_name: 'Zkušební',
    emails: [{ value: 'jan.zkusebni@priklad.cz' }], phones: [{ value: '+420 602 000 000' }] },
};

let volani = [];
let rezim = 'normal';           /* normal | limit | spadlo | token */
let limitZbyva = 0;

globalThis.fetch = async (url, init) => {
  volani.push({ url: String(url), init });
  const u = new URL(String(url));
  const odpoved = (data, stav = 200, telo) => new Response(
    JSON.stringify(telo || { success: stav < 400, data }),
    { status: stav, headers: { 'Content-Type': 'application/json' } });

  if (rezim === 'spadlo') throw new Error('ECONNREFUSED');
  if (rezim === 'token') return odpoved(null, 401, { success: false, error: 'unauthorized access' });
  if (rezim === 'limit' && limitZbyva > 0) { limitZbyva--; return odpoved(null, 429, { success: false }); }

  if (u.pathname === '/api/v2/dealFields') return odpoved(POLE_ODPOVED);
  if (u.pathname === '/api/v2/organizationFields') return odpoved(POLE_ORG_ODPOVED);
  if (u.pathname === '/api/v2/deals') {
    const stav = u.searchParams.get('status');
    const vybrane = stav ? DEALY.filter(d => d.status === stav) : DEALY;
    return odpoved(vybrane, 200, { success: true, data: vybrane, additional_data: { next_cursor: null } });
  }
  const md = /^\/api\/v2\/deals\/(\d+)$/.exec(u.pathname);
  if (md) { const d = DEALY.find(x => x.id === Number(md[1])); return d ? odpoved(d) : odpoved(null, 404); }
  const mo = /^\/api\/v2\/organizations\/(\d+)$/.exec(u.pathname);
  if (mo) { const o = ORGANIZACE[mo[1]]; return o ? odpoved(o) : odpoved(null, 404); }
  const mp = /^\/api\/v2\/persons\/(\d+)$/.exec(u.pathname);
  if (mp) { const p = OSOBY[mp[1]]; return p ? odpoved(p) : odpoved(null, 404); }
  return odpoved(null, 404);
};

/* ---------- čisté funkce ---------- */

console.log('\n===== PŘEKLAD NÁZVŮ A HODNOT =====\n');

test('číslo nabídky se vyčte z názvu dealu', pdCisloZNazvu('CN-84 Zkušební 1') === 'CN-84');
test('poznají se i opravy (OPR)', pdCisloZNazvu('OPR12-2025 Oprava') === 'OPR-12-2025');
test('název bez čísla nevrací vymyšlené číslo', pdCisloZNazvu('Jen popis') === '');
test('název akce je zbytek za číslem', pdNazevAkce('CN-84 Zkušební 1') === 'Zkušební 1');
test('název bez čísla zůstane celý', pdNazevAkce('Jen popis') === 'Jen popis');

test('hodnota výběrového pole se čte jako popiska',
  pdHodnota({ id: 54, label: 'Realizace' }) === 'Realizace');
test('peněžní pole se čte jako částka', pdHodnota({ value: 2300, currency: 'EUR' }) === '2300');
test('adresní pole se čte jako celá adresa',
  pdHodnota({ value: 'x', formatted_address: 'Zkušební 12, Zkušebín' }) === 'Zkušební 12, Zkušebín');
test('vícevýběr se spojí čárkou',
  pdHodnota([{ label: 'A' }, { label: 'B' }]) === 'A, B');
test('prázdná hodnota nedělá „null" v dokumentu', pdHodnota(null) === '' && pdHodnota(undefined) === '');

test('konečná faktura se dopočítá do sta procent', pdZbytekDoSta(50, 40) === '10');
test('nesmyslné zálohy konečnou fakturu radši nevrátí', pdZbytekDoSta(80, 40) === '');
test('chybějící údaj konečnou fakturu nevymyslí', pdZbytekDoSta('', 40) === '');

console.log('\n===== MAPA POLÍ PODLE NÁZVU =====\n');

const m = pdMapaZPoli(POLE_ODPOVED, POLE_DEALU);
test('splatnost se spáruje', m.mapa.splatnostDni === HASH.splatnost);
test('záloha se spáruje', m.mapa.zaloha1Proc === HASH.zaloha);
test('dílčí faktura se nespletla se zálohou', m.mapa.faktura2Proc === HASH.faktura2);
test('adresa stavby se spáruje', m.mapa.adresaStavby === HASH.adresa);
test('termín se spáruje', m.mapa.terminPlneni === HASH.termin);
test('objednatel a kontakt se spárují',
  m.mapa.objednatelFirma === HASH.firma && m.mapa.objednatelOsoba === HASH.osoba);
test('jedno pole se nepoužije dvakrát',
  new Set(Object.values(m.mapa)).size === Object.values(m.mapa).length,
  JSON.stringify(m.mapa));
test('standardní (nevlastní) pole se do mapy nedostanou',
  !Object.values(m.mapa).includes('title'));
test('co se nespárovalo, se nezahodí, ale vypíše',
  m.nezarazeno.some(x => x.hash === HASH.neznamé), JSON.stringify(m.nezarazeno));
/* Kdyby se pole v CRM přejmenovalo, mapa musí říct, že chybí — jinak by
 * kalkulačka tiše vracela prázdno a nikdo by nevěděl proč. */
const mBezAdresy = pdMapaZPoli(POLE_ODPOVED.filter(p => p.key !== HASH.adresa), POLE_DEALU);
test('přejmenované (chybějící) pole se ohlásí jako chybějící',
  mBezAdresy.chybi.some(x => x.klic === 'adresaStavby'));
const mo2 = pdMapaZPoli(POLE_ORG_ODPOVED, POLE_ORGANIZACE);
test('IČO se najde mezi poli organizace', mo2.mapa.ico === HASH.ico);

const prelozeny = pdDealNaNase(DEALY[0], m.mapa,
  { organizace: ORGANIZACE[901], osoba: OSOBY[801], mapaOrganizace: mo2.mapa });
test('objednatel se vezme z organizace', prelozeny.objednatel === 'Výtahy Zkušební s.r.o.');
test('IČO se přenese z organizace', prelozeny.ico === '12345678');
test('kontakt nese e-mail i telefon',
  prelozeny.kontaktObjednatel === 'jan.zkusebni@priklad.cz, +420 602 000 000');
test('typ zakázky se přeloží na popisku', prelozeny.typZakazky === 'Projekce - Výtah + OCK');
/* Cena z CRM se smí zobrazit k porovnání, ale nesmí se tvářit jako výsledek
 * kalkulace — pravidlo projektu: částky vznikají výhradně z výpočtu. */
test('cena z CRM je vedená zvlášť jako informativní',
  prelozeny.hodnotaCrm === 487500 && prelozeny.cena === undefined);

/* ---------- serverové funkce ---------- */

console.log('\n===== BEZ NASTAVENÉHO NAPOJENÍ =====\n');

delete process.env[PD_TOKEN_PROMENNA];
delete process.env[PD_DOMENA_PROMENNA];

const cAdmin = (await (async () => {
  const r = await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: ADMIN_EMAIL, heslo: 'Docasne.Heslo.123' });
  return (r.headers.get('set-cookie') || '').split(';')[0];
})());
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'obchod@example.com', jmeno: 'Obchodník',
    role: 'Obchodník', heslo: 'ObchodHeslo1' }, cAdmin);
const cObch = (await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: 'obchod@example.com', heslo: 'ObchodHeslo1' })).headers.get('set-cookie').split(';')[0];

test('seznam dealů bez přihlášení neprojde',
  (await get(pdDealy, 'http://x/api/pd/dealy')).status === 401);
test('detail dealu bez přihlášení neprojde',
  (await get(pdDeal, 'http://x/api/pd/deal?id=1')).status === 401);
test('mapa polí bez přihlášení neprojde',
  (await get(pdPole, 'http://x/api/pd/pole')).status === 401);

const bezNastaveni = await (await get(pdDealy, 'http://x/api/pd/dealy', cObch)).json();
test('bez tokenu se aplikace nerozbije, jen řekne, že napojení není',
  bezNastaveni.ok === true && bezNastaveni.nastaveno === false
  && Array.isArray(bezNastaveni.dealy) && bezNastaveni.dealy.length === 0);
test('a nevolá se přitom nikam ven', volani.length === 0, volani.length);

console.log('\n===== ČTENÍ Z PIPEDRIVE =====\n');

process.env[PD_TOKEN_PROMENNA] = 'zkusebni-token-jen-pro-test';
process.env[PD_DOMENA_PROMENNA] = 'zkusebni-firma';
volani = [];

test('doména se srovná i když ji někdo zadá celou',
  pdZaklad() === 'https://zkusebni-firma.pipedrive.com');
process.env[PD_DOMENA_PROMENNA] = 'https://zkusebni-firma.pipedrive.com/';
test('a i s protokolem a lomítkem na konci',
  pdZaklad() === 'https://zkusebni-firma.pipedrive.com');
test('odkaz na deal míří do webového Pipedrivu',
  pdOdkazNaDeal(84) === 'https://zkusebni-firma.pipedrive.com/deal/84');

const seznam = await (await get(pdDealy, 'http://x/api/pd/dealy', cObch)).json();
test('seznam vrátí otevřené případy', seznam.ok && seznam.dealy.length === 2, seznam.dealy && seznam.dealy.length);
test('případy nesou vyčtené číslo nabídky',
  seznam.dealy.every(d => /^CN-\d+$/.test(d.cislo)), JSON.stringify(seznam.dealy.map(d => d.cislo)));
test('seznam neveze vlastní pole (zbytečný objem)',
  !JSON.stringify(seznam.dealy).includes('Zkušební 12'));

const hledani = await (await get(pdDealy,
  'http://x/api/pd/dealy?hledat=borivojovo&stav=vse', cObch)).json();
test('hledání funguje i bez diakritiky', hledani.dealy.length === 1
  && hledani.dealy[0].cislo === 'CN-85', JSON.stringify(hledani.dealy));
const dleCisla = await (await get(pdDealy, 'http://x/api/pd/dealy?hledat=CN-84', cObch)).json();
test('hledat jde i podle čísla nabídky', dleCisla.dealy.length === 1);
const vse = await (await get(pdDealy, 'http://x/api/pd/dealy?stav=vse', cObch)).json();
test('otevřené případy se nabízejí jako první',
  vse.dealy[0].stav === 'open' && vse.dealy[vse.dealy.length - 1].stav === 'lost',
  vse.dealy.map(d => d.stav).join(','));

console.log('\n===== DETAIL PRO HLAVIČKU A KRYCÍ LIST =====\n');

const detail = await (await get(pdDeal, 'http://x/api/pd/deal?id=1', cObch)).json();
test('detail se načte', detail.ok === true, JSON.stringify(detail).slice(0, 200));
test('hlavička dostane číslo nabídky', detail.deal.cislo === 'CN-84');
test('hlavička dostane název akce', detail.deal.nazevAkce === 'Zkušební ulice 1, Zkušebín');
test('hlavička dostane adresu stavby', detail.deal.adresa === 'Zkušební 12, Zkušebín');
/* Dvouúrovňový model: org_id dealu je investor, objednatel visí ve vlastním
 * poli. Kdyby se vzala organizace dealu, stál by na nabídce investor. */
test('objednatelem je výtahová firma z vlastního pole, ne investor z org_id',
  detail.deal.objednatel === 'Výtahy Zkušební s.r.o.', detail.deal.objednatel);
test('krycí list dostane splatnost', String(detail.deal.splatnostDni) === '14');
test('krycí list dostane zálohu i dílčí fakturu',
  String(detail.deal.zaloha1Proc) === '50' && String(detail.deal.faktura2Proc) === '40');
test('konečná faktura se dopočítá na 10 %', detail.deal.fakturaKoncProc === '10');
test('krycí list dostane termín', detail.deal.terminPlneni === '2027-03-31');
test('krycí list dostane odkaz do Pipedrivu (pole Scoring)',
  detail.deal.odkaz === 'https://zkusebni-firma.pipedrive.com/deal/1');
test('odpověď nikde neveze přístupový token',
  !JSON.stringify(detail).includes(process.env[PD_TOKEN_PROMENNA]));

const bezCisla = await (await get(pdDeal, 'http://x/api/pd/deal?id=4', cObch)).json();
test('případ bez čísla v názvu se načte, ale řekne o tom',
  bezCisla.ok && bezCisla.deal.cislo === '' && bezCisla.varovani.some(v => /číslo nabídky/i.test(v)),
  JSON.stringify(bezCisla.varovani));
test('neznámý případ vrátí 404, ne prázdno',
  (await get(pdDeal, 'http://x/api/pd/deal?id=999', cObch)).status === 404);
test('dotaz bez čísla případu se odmítne',
  (await get(pdDeal, 'http://x/api/pd/deal', cObch)).status === 400);

console.log('\n===== ŠETŘENÍ ROZPOČTU A CHOVÁNÍ PŘI POTÍŽÍCH =====\n');

const naPole = () => volani.filter(v => /Fields/.test(v.url)).length;
const pred = naPole();
await get(pdDeal, 'http://x/api/pd/deal?id=2', cObch);
await get(pdDeal, 'http://x/api/pd/deal?id=2', cObch);
test('mapa polí se cachuje (další načtení už do CRM nechodí)', naPole() === pred, naPole() - pred);

test('obnovit mapu polí smí jen administrátor',
  (await get(pdPole, 'http://x/api/pd/pole?obnovit=1', cObch)).status === 403);
const predAdmin = naPole();
await get(pdPole, 'http://x/api/pd/pole?obnovit=1', cAdmin);
test('administrátor si vynucené obnovení vyžádá', naPole() > predAdmin);

test('token jde v hlavičce, ne v adrese (adresa se zapisuje do logů)',
  volani.every(v => !v.url.includes(process.env[PD_TOKEN_PROMENNA]))
  && volani.every(v => (v.init.headers || {})['x-api-token'] === process.env[PD_TOKEN_PROMENNA]));
test('dealy se čtou přes API v2 (v1 je od 1. 8. 2026 bez podpory)',
  volani.filter(v => /\/deals/.test(v.url)).every(v => /\/api\/v2\//.test(v.url)));

rezim = 'limit'; limitZbyva = 2; volani = [];
const poLimitu = await (await get(pdDealy, 'http://x/api/pd/dealy?stav=won', cObch)).json();
test('vyčerpaný limit se přečká opakováním, ne chybou', poLimitu.ok === true, JSON.stringify(poLimitu).slice(0, 120));
test('a opakovalo se opravdu (tři volání na jeden dotaz)', volani.length === 3, volani.length);

rezim = 'limit'; limitZbyva = 99;
const porad = await (await get(pdDealy, 'http://x/api/pd/dealy?stav=won', cObch)).json();
test('trvale vyčerpaný limit skončí srozumitelnou hláškou, ne prázdným seznamem',
  porad.ok === false && /limit/i.test(porad.chyba), JSON.stringify(porad));

rezim = 'spadlo';
const spadlo = await get(pdDealy, 'http://x/api/pd/dealy?stav=lost', cObch);
const spadloTelo = await spadlo.json();
test('spadlé spojení se nesmí tvářit jako prázdný Pipedrive',
  spadloTelo.ok === false && spadlo.status === 502, JSON.stringify(spadloTelo));

rezim = 'token';
const spatnyToken = await (await get(pdDealy, 'http://x/api/pd/dealy?stav=lost', cObch)).json();
test('odmítnutý token řekne, kde se opravuje',
  spatnyToken.ok === false && spatnyToken.chyba.includes(PD_TOKEN_PROMENNA), spatnyToken.chyba);

rezim = 'normal';

console.log(`\n${ok} prošlo, ${fail} selhalo`);
if (fail) console.log('\nSelhalo:\n - ' + selhalo.join('\n - '));
process.exit(fail ? 1 : 0);
