/* NABÍDKA PROJ SE ŘÍDÍ POLOŽKAMI, NE JEN SEKCEMI (5. 9. 2026)
 * ===========================================================
 *
 * Hlášeno J. V.: „přestože mám ve výpočtu elektroprojekt škrtnutý, zobrazuje
 * se mi v cenové nabídce." Do 5. 9. se rozsah nabídky řídil jen SEKCÍ: měla-li
 * sekce DPZ cenu, vytiskl se celý její text — včetně části 4 (Elektro projekt),
 * kterou obchodník v kalkulaci vyřadil. Nabídka tak slibovala zákazníkovi něco,
 * co se neúčtuje.
 *
 * Klíč `sekce:Název položky` v definici dokumentu proto znamená „ukaž se, jen
 * když se TAHLE položka počítá". Sada projde VŠECHNY položky kalkulace PROJ
 * a u každé zkontroluje obojí:
 *   – vyřazení položky, která má v nabídce vlastní text, ten text schová,
 *   – vyřazení položky, která vlastní text nemá, s dokumentem nehne
 *     (kromě částky sekce) — jinak by se text ztrácel bez důvodu.
 *
 * Kontroluje se i to, že se sekce jako celek nerozpadne: DPZ bez elektro
 * projektu je pořád DPZ a musí mít cenu i zbytek rozsahu.
 */
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { global[k] = ep[k]; });
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI;
global.DEFAULT_CENIK = ZC.zkusebniCenik();
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
Object.keys(tsm).forEach(k => { global[k] = tsm[k]; });
const zk = require('./zakazka.js');
global.projHlavicka = zk.projHlavicka; global.projHlavickaEfektivni = zk.projHlavickaEfektivni;
global.projCisloNabidky = zk.projCisloNabidky;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const pr = require('./preklad.js');
Object.keys(pr).forEach(k => { global[k] = pr[k]; });
const SLV = require('./sleva.js');
global.slevaPodil = SLV.slevaPodil;
const NP = require('./nabidka_proj.js');
const { nabidkaProjData } = NP;

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* Zakázka se VŠEMI sekcemi zapnutými — teprve pak jde měřit, co zmizí. */
function zakazka() {
  const z = zk.novaZakazka();
  z.cislo = '2026 OVP CN 0101'; z.nazevAkce = 'Výstavba výtahu';
  z.objednatel = 'SVJ Ulice 1'; z.adresa = 'Ulice 1, Praha';
  const pj = z.varianty[0].data.proj.zadani;
  pj.sekce.forEach(s => s.polozky.forEach(p => { p.vyrazeno = false; }));
  /* Zkušební ceník má u části fixních položek nulu (např. studie osvitu).
   * Nula je od 4. 9. 2026 „vypnuto", takže by se text neukázal ani v plné
   * nabídce a test by měřil něco jiného, než chce. Fixtura je proto ocení. */
  const c = z.varianty[0].data.proj.cenik;
  Object.keys(c.fixy || {}).forEach(k => { if (!c.fixy[k]) c.fixy[k] = 12000; });
  return z;
}

/* Celý text dokumentu jako jeden řetězec — hledá se v něm, co zmizelo. */
function textNabidky(z) {
  const d = nabidkaProjData(z, z.varianty[0]);
  const kus = b => [b.nadpis, b.text, b.popis,
    ...(b.odstavce || []), ...(b.radky || []).map(x => Array.isArray(x) ? x.join(' ') : x),
    ...(b.uvod || [])].filter(Boolean).join(' ');
  return d.bloky.map(kus).join('\n');
}

/* Text JEDNOHO bloku podle nadpisu. Některé věty jsou ve VZORu dvakrát
 * (zaměření je samostatná činnost i část 1 studie), takže hledat je v celém
 * dokumentu by nic neřeklo. */
function textBloku(z, nadpisCast) {
  const d = nabidkaProjData(z, z.varianty[0]);
  const b = d.bloky.find(x => String(x.nadpis || '').indexOf(nadpisCast) >= 0);
  if (!b) return '';
  return [b.nadpis, b.popis, ...(b.uvod || []),
    ...(b.radky || []).map(x => Array.isArray(x) ? x.join(' ') : x)].filter(Boolean).join('\n');
}

function bezPolozky(sekceKey, nazev) {
  const z = zakazka();
  const s = z.varianty[0].data.proj.zadani.sekce.find(x => x.key === sekceKey);
  const p = s.polozky.find(x => x.nazev === nazev);
  p.vyrazeno = true;
  return z;
}

const PLNY = textNabidky(zakazka());

/* ---------- 1) jádro nálezu: elektro projekt v DPZ ---------- */
{
  const t = textNabidky(bezPolozky('dpz', 'Elektro projekt'));
  test('vyřazený elektro projekt zmizí z rozsahu DPZ',
    /Elektro projekt/.test(PLNY) && !/technická zpráva elektro v rozsahu pro stavební povolení/.test(t));
  test('a zmizí i podnadpis jeho části', !/povolení záměru – část 4/.test(t));
  test('ale zbytek DPZ v nabídce zůstává',
    /technická zpráva požárně bezpečnostního řešení/.test(t) && /statické výpočty nových konstrukcí/.test(t));
  const vetaDpz = x => (x.match(/Zpracování projektu pro DPZ[^\n]*/) || [''])[0];
  test('a věta u ceny už elektro projekt neslibuje',
    /CENA ZA DOKUMENTACI PRO POVOLENÍ ZÁMĚRU/.test(t) && !/ELEKTRO PROJEKTU/.test(vetaDpz(t)),
    vetaDpz(t));
  test('v plné nabídce ta věta elektro projekt naopak uvádí',
    /ELEKTRO PROJEKTU/.test(vetaDpz(PLNY)), vetaDpz(PLNY));
}

/* ---------- 2) totéž pro ostatní části s vlastním textem ---------- */
const VLASTNI_TEXT = [
  ['dpz', 'PBŘ', 'technická zpráva požárně bezpečnostního řešení', 'povolení záměru – část 2', 'POVOLENÍ ZÁMĚRU (DPZ)'],
  ['dpz', 'Statika', 'technická zpráva statika', 'povolení záměru – část 3', 'POVOLENÍ ZÁMĚRU (DPZ)'],
  ['dpz', 'Elektro projekt', 'technická zpráva elektro v rozsahu pro stavební povolení', 'povolení záměru – část 4', 'POVOLENÍ ZÁMĚRU (DPZ)'],
  ['dpz', 'Studie osvitu (Praha 4 a 6)', 'posouzení oslunění a denního osvětlení', 'povolení záměru – část 5', 'POVOLENÍ ZÁMĚRU (DPZ)'],
  ['dps', 'Statika', 'statická realizační zpráva', 'provedení stavby – část 2', 'PROVEDENÍ STAVBY (DPS)'],
  ['dps', 'Elektro projekt', 'realizační technická zpráva elektro', 'provedení stavby – část 3', 'PROVEDENÍ STAVBY (DPS)'],
  /* Zaměření je ve VZORu dvakrát — kontroluje se proto blok ZA, ne celý
   * dokument: v části 1 studie ta věta zůstat MÁ, patří ke studii. */
  ['zamereni', 'Výstup', 'zpracování výstupu ze zaměření', null, 'ZPRACOVÁNÍ VÝSTUPŮ (ZA)'],
];
VLASTNI_TEXT.forEach(([sekce, nazev, veta, cast, blok]) => {
  const zBez = bezPolozky(sekce, nazev);
  const plnyBlok = textBloku(zakazka(), blok);
  const t = textBloku(zBez, blok);
  test(`„${nazev}" (${sekce}): text je v plné nabídce`, plnyBlok.includes(veta), veta);
  test(`„${nazev}" (${sekce}): po vyřazení text zmizí`, !t.includes(veta),
    (t.split('\n').find(x => x.includes(veta)) || '').slice(0, 90));
  if (cast) test(`„${nazev}" (${sekce}): zmizí i podnadpis části`, !t.includes(cast),
    (t.split('\n').find(x => x.includes(cast)) || '').slice(0, 90));
});

/* ---------- 3) položky BEZ vlastního textu dokumentem nehýbou ----------
 * Pojistka proti opačné chybě: kdyby se klíč překlepl, text by mizel u položky,
 * ke které nepatří. Porovnává se text bez řádků s částkami (ty se změnit MAJÍ). */
const bezCastek = t => t.split('\n').filter(x => !/Kč|EUR|€/.test(x)).join('\n');
const BEZ_TEXTU = [
  ['dpz', 'Projektová dokumentace pro SÚ'],
  ['studie', 'Konzultace'],
  ['projednani', 'Územní rozvoj'],
  ['dps', 'Projekt pro DPS – stavební část'],
];
BEZ_TEXTU.forEach(([sekce, nazev]) => {
  const t = textNabidky(bezPolozky(sekce, nazev));
  test(`„${nazev}" (${sekce}) nemá vlastní text a dokument se nemění`,
    bezCastek(t) === bezCastek(PLNY),
    (bezCastek(PLNY).split('\n').find((x, i) => x !== bezCastek(t).split('\n')[i]) || '').slice(0, 80));
});

/* ---------- 4) vyřazení VŠECH položek sekce sekci z nabídky vypustí ---------- */
{
  const z = zakazka();
  const s = z.varianty[0].data.proj.zadani.sekce.find(x => x.key === 'dpz');
  s.polozky.forEach(p => { p.vyrazeno = true; });
  const t = textNabidky(z);
  test('sekce bez jediné počítané položky se v nabídce neuvádí vůbec',
    !/DOKUMENTACE PRO POVOLENÍ ZÁMĚRU \(DPZ\)/.test(t));
  test('a ostatní sekce zůstávají', /STUDIE PROVEDITELNOSTI/.test(t) && /INŽENÝRSKÁ ČINNOST/.test(t));
}

/* ---------- 5) nulová částka položky = totéž co vyřazení ----------
 * „Vypnuto množstvím 0" (nález V22) musí platit i pro nabídku: položka za nula
 * korun se neúčtuje, takže ji dokument nemá slibovat. */
{
  const z = zakazka();
  const s = z.varianty[0].data.proj.zadani.sekce.find(x => x.key === 'dpz');
  const p = s.polozky.find(x => x.nazev === 'Elektro projekt');
  p.cenaPrepis = 0;
  const t = textNabidky(z);
  test('položka přepsaná na 0 Kč se v nabídce chová jako vyřazená',
    !/technická zpráva elektro v rozsahu pro stavební povolení/.test(t));
}

/* ---------- 6) přejmenovanou položku pravidlo pořád najde ----------
 * Obchodník smí název položky přepsat; kdyby se hledalo jen podle nového
 * jména, text by se odpojil od položky a začal by se tisknout vždycky. */
{
  const z = zakazka();
  const s = z.varianty[0].data.proj.zadani.sekce.find(x => x.key === 'dpz');
  const p = s.polozky.find(x => x.nazev === 'Elektro projekt');
  p.origNazev = 'Elektro projekt';
  p.nazev = 'Elektroinstalace – projekt';
  p.vyrazeno = true;
  const t = textNabidky(z);
  test('vyřazená přejmenovaná položka text taky schová',
    !/technická zpráva elektro v rozsahu pro stavební povolení/.test(t));
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
