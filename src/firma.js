/* ============================================================
 * FIRMA (SET-3) – firemní údaje pro dokumenty
 *
 * Jedno místo, kde jsou uložené údaje NAŠÍ firmy (zhotovitele):
 * název, IČO, DIČ, zápis v OR, sídlo, korespondenční adresa,
 * bankovní spojení, telefon, e-mail, web, logo a zpracovatel nabídky.
 *
 * Údaje se propisují:
 *   – do cenové nabídky (nabidka.js) přes zástupné symboly {{FIRMA_…}},
 *   – do krycího listu (kryci.js) jako sekce „Dodavatel (naše firma)“,
 *   – do tiskových náhledů (hlavička s logem).
 *
 * Uložení: NAST.firma → konfigurace.json, sekce „nastaveni“ (SET-2).
 * Editace: Nastavení → Firma – JEN ADMINISTRÁTOR.
 *
 * Modul je čistá logika bez DOM, aby šel testovat v Node (test_firma.js).
 * ============================================================ */

/* Definice polí. symbol = název zástupného symbolu {{…}} v .docx šabloně. */
const FIRMA_POLE = [
  /* --- identifikace --- */
  { id: 'nazev', sekce: 'Identifikace', label: 'Název firmy', symbol: 'FIRMA_NAZEV', povinne: true },
  { id: 'ico', sekce: 'Identifikace', label: 'IČO', symbol: 'FIRMA_ICO', povinne: true },
  { id: 'dic', sekce: 'Identifikace', label: 'DIČ', symbol: 'FIRMA_DIC' },
  { id: 'zapis', sekce: 'Identifikace', label: 'Zápis v obchodním rejstříku', symbol: 'FIRMA_ZAPIS' },

  /* --- sídlo --- */
  { id: 'sidloUlice', sekce: 'Sídlo', label: 'Ulice a číslo popisné', symbol: 'FIRMA_SIDLO_ULICE', povinne: true },
  { id: 'sidloPsc', sekce: 'Sídlo', label: 'PSČ', symbol: 'FIRMA_SIDLO_PSC', povinne: true },
  { id: 'sidloMesto', sekce: 'Sídlo', label: 'Město', symbol: 'FIRMA_SIDLO_MESTO', povinne: true },
  { id: 'sidloZeme', sekce: 'Sídlo', label: 'Země', symbol: 'FIRMA_SIDLO_ZEME' },

  /* --- korespondenční adresa (nepovinná; prázdná = shodná se sídlem) --- */
  { id: 'korShodna', sekce: 'Korespondenční adresa', label: 'Korespondenční adresa je shodná se sídlem', typ: 'check' },
  { id: 'korUlice', sekce: 'Korespondenční adresa', label: 'Ulice a číslo popisné', symbol: 'FIRMA_KOR_ULICE' },
  { id: 'korPsc', sekce: 'Korespondenční adresa', label: 'PSČ', symbol: 'FIRMA_KOR_PSC' },
  { id: 'korMesto', sekce: 'Korespondenční adresa', label: 'Město', symbol: 'FIRMA_KOR_MESTO' },
  { id: 'korZeme', sekce: 'Korespondenční adresa', label: 'Země', symbol: 'FIRMA_KOR_ZEME' },

  /* --- bankovní spojení --- */
  { id: 'banka', sekce: 'Bankovní spojení', label: 'Banka', symbol: 'FIRMA_BANKA' },
  { id: 'ucet', sekce: 'Bankovní spojení', label: 'Číslo účtu', symbol: 'FIRMA_UCET' },
  { id: 'iban', sekce: 'Bankovní spojení', label: 'IBAN', symbol: 'FIRMA_IBAN' },
  { id: 'swift', sekce: 'Bankovní spojení', label: 'SWIFT / BIC', symbol: 'FIRMA_SWIFT' },

  /* --- kontakty --- */
  { id: 'telefon', sekce: 'Kontakty', label: 'Telefon', symbol: 'FIRMA_TELEFON', povinne: true },
  { id: 'email', sekce: 'Kontakty', label: 'E-mail', symbol: 'FIRMA_EMAIL' },
  { id: 'web', sekce: 'Kontakty', label: 'Web', symbol: 'FIRMA_WEB' },

  /* --- zpracovatel nabídky (podepsaná osoba v patičce dokumentu) --- */
  { id: 'zpracoval', sekce: 'Zpracovatel nabídky', label: 'Vypracoval', symbol: 'FIRMA_ZPRACOVAL' },
  { id: 'zpracovalTelefon', sekce: 'Zpracovatel nabídky', label: 'Telefon zpracovatele', symbol: 'FIRMA_ZPRACOVAL_TEL' },
  { id: 'zpracovalEmail', sekce: 'Zpracovatel nabídky', label: 'E-mail zpracovatele', symbol: 'FIRMA_ZPRACOVAL_EMAIL' },
];

/* Pořadí sekcí ve formuláři i v náhledech. */
const FIRMA_SEKCE = ['Identifikace', 'Sídlo', 'Korespondenční adresa', 'Bankovní spojení',
  'Kontakty', 'Zpracovatel nabídky'];

/* UKÁZKOVÉ ÚDAJE, NE SKUTEČNÉ.
 *
 * Skutečné firemní údaje – název, IČO, adresa, telefony i jméno
 * zpracovatele nabídky – jsou osobní a firemní data a ve zdrojovém kódu
 * nemají co dělat. Bydlí v `_nastaveni.json` ve složce `_DB`, odkud se
 * načtou při spuštění a tyhle hodnoty přepíšou (viz nastaveni_db.js).
 * Kdo pracuje bez připojené složky, přepíše si je v Nastavení → Firma.
 *
 * Vzor je vyplněný záměrně celý: kdyby byl prázdný, nešlo by na první
 * pohled poznat, které pole kam v hlavičce a patičce dokumentu patří. */
const DEFAULT_FIRMA = {
  /* Značka vymyšlených dat (#40, ukazkove.js). Zmizí sama, jakmile se
   * ze složky načte `_nastaveni.json` – ten se do NAST.firma kopíruje
   * přes konfigNahradVMiste(), který nejdřív zahodí celý starý obsah.
   * Ruční přepsání údajů v Nastavení → Firma ji smaže taky (firmaSet). */
  ukazkove: true,
  nazev: 'Ukázková firma s.r.o.',
  ico: '000 00 000',
  dic: '',
  zapis: '',

  sidloUlice: 'Vzorová 1',
  sidloPsc: '100 00',
  sidloMesto: 'Praha',
  sidloZeme: 'Česká republika',

  korShodna: true,
  korUlice: '', korPsc: '', korMesto: '', korZeme: '',

  banka: '', ucet: '', iban: '', swift: '',

  telefon: '+420 000 000 000',
  email: '',
  web: 'www.priklad.cz',

  zpracoval: 'Jan Vzorový',
  zpracovalTelefon: '+420 000 000 000',
  zpracovalEmail: 'jan.vzorovy@priklad.cz',

  /* logo: data URL (obrázek se ukládá přímo v konfiguraci, aby šel přenést) */
  logo: '', logoNazev: '',
};

function firmaDefault() { return JSON.parse(JSON.stringify(DEFAULT_FIRMA)); }

/* aktuální firemní údaje: z NAST (prohlížeč), jinak výchozí (Node / testy) */
function firmaAktualni() {
  if (typeof NAST !== 'undefined' && NAST && NAST.firma) return NAST.firma;
  return firmaDefault();
}

function firmaPole(id) { return FIRMA_POLE.find(p => p.id === id) || null; }
function firmaHodnota(f, id) {
  const v = (f || {})[id];
  return v == null ? '' : (typeof v === 'boolean' ? v : String(v).trim());
}

/* jednořádková adresa: „Vzorová 1, 100 00 Praha“ (země se přidá, liší-li se od ČR) */
function firmaAdresaRadek(f, pref) {
  const g = k => firmaHodnota(f, pref + k);
  const ulice = g('Ulice'), psc = g('Psc'), mesto = g('Mesto'), zeme = g('Zeme');
  const mesto2 = [psc, mesto].filter(Boolean).join(' ');
  const zakl = [ulice, mesto2].filter(Boolean).join(', ');
  if (!zakl) return '';
  return zeme && !/^(česká republika|cesko|česko|cz)$/i.test(zeme) ? zakl + ', ' + zeme : zakl;
}
function firmaSidlo(f) { return firmaAdresaRadek(f, 'sidlo'); }
/* korespondenční adresa; při „shodná se sídlem“ (nebo prázdné) vrací sídlo */
function firmaKorespondencni(f) {
  if (firmaHodnota(f, 'korShodna')) return firmaSidlo(f);
  return firmaAdresaRadek(f, 'kor') || firmaSidlo(f);
}
/* bankovní spojení jako jeden řádek: „Banka, ú. 123/0800, IBAN …“ */
function firmaBankaRadek(f) {
  const banka = firmaHodnota(f, 'banka'), ucet = firmaHodnota(f, 'ucet');
  const iban = firmaHodnota(f, 'iban'), swift = firmaHodnota(f, 'swift');
  const casti = [];
  if (banka) casti.push(banka);
  if (ucet) casti.push('č. ú. ' + ucet);
  if (iban) casti.push('IBAN ' + iban);
  if (swift) casti.push('SWIFT ' + swift);
  return casti.join(', ');
}
/* identifikace na jeden řádek: „IČO: 000 00 000, DIČ: CZ…“ */
function firmaIcoDic(f) {
  const ico = firmaHodnota(f, 'ico'), dic = firmaHodnota(f, 'dic');
  return [ico ? 'IČO: ' + ico : '', dic ? 'DIČ: ' + dic : ''].filter(Boolean).join(', ');
}
/* patička dokumentu: „Ukázková firma s.r.o., Vzorová 1, 100 00 Praha, IČO: …, tel. …, web“ */
function firmaPaticka(f) {
  return [firmaHodnota(f, 'nazev'), firmaSidlo(f), firmaIcoDic(f),
    firmaHodnota(f, 'telefon') ? 'tel. ' + firmaHodnota(f, 'telefon') : '',
    firmaHodnota(f, 'email'), firmaHodnota(f, 'web')].filter(Boolean).join(', ');
}

/* Zástupné symboly {{…}} pro .docx šablony. prekl = funkce překladu hodnot
 * (překládá se jen země – vlastní jména a adresy se nikdy nepřekládají). */
function firmaPlaceholders(f, prekl) {
  f = f || firmaAktualni();
  const P = typeof prekl === 'function' ? prekl : (x => x);
  const out = {};
  FIRMA_POLE.forEach(p => {
    if (!p.symbol) return;
    let v = firmaHodnota(f, p.id);
    if (p.id === 'sidloZeme' || p.id === 'korZeme') v = v ? P(v) : v;
    out[p.symbol] = v;
  });
  out.FIRMA_SIDLO = firmaSidlo(f);
  out.FIRMA_KORESPONDENCNI = firmaKorespondencni(f);
  out.FIRMA_BANKA_RADEK = firmaBankaRadek(f);
  out.FIRMA_ICO_DIC = firmaIcoDic(f);
  out.FIRMA_PATICKA = firmaPaticka(f);
  return out;
}
/* seznam všech symbolů, které firma poskytuje (nápověda v Nastavení + testy) */
function firmaSymboly() {
  return FIRMA_POLE.filter(p => p.symbol).map(p => p.symbol)
    .concat(['FIRMA_SIDLO', 'FIRMA_KORESPONDENCNI', 'FIRMA_BANKA_RADEK', 'FIRMA_ICO_DIC', 'FIRMA_PATICKA']);
}

/* Řádky [popisek, hodnota] pro náhledy a krycí list; prázdné se vynechají.
 * prekl = funkce překladu POPISKŮ (hodnoty zůstávají tak, jak jsou zadané). */
function firmaRadky(f, prekl) {
  f = f || firmaAktualni();
  const P = typeof prekl === 'function' ? prekl : (x => x);
  const radky = [];
  const pridej = (label, val) => { if (val) radky.push([P(label), val]); };
  pridej('Název firmy', firmaHodnota(f, 'nazev'));
  pridej('IČO', firmaHodnota(f, 'ico'));
  pridej('DIČ', firmaHodnota(f, 'dic'));
  pridej('Zápis v obchodním rejstříku', firmaHodnota(f, 'zapis'));
  pridej('Sídlo', firmaSidlo(f));
  const kor = firmaKorespondencni(f);
  if (kor && kor !== firmaSidlo(f)) pridej('Korespondenční adresa', kor);
  pridej('Bankovní spojení', firmaBankaRadek(f));
  pridej('Telefon', firmaHodnota(f, 'telefon'));
  pridej('E-mail', firmaHodnota(f, 'email'));
  pridej('Web', firmaHodnota(f, 'web'));
  pridej('Vypracoval', firmaHodnota(f, 'zpracoval'));
  return radky;
}

/* Kontrola vyplnění – NEBLOKUJE, vrací jen seznam chybějících povinných polí. */
function firmaKontrola(f) {
  f = f || firmaAktualni();
  const chybi = FIRMA_POLE.filter(p => p.povinne && !firmaHodnota(f, p.id));
  return { chybi: chybi.map(p => p.label), pocet: chybi.length, ok: chybi.length === 0 };
}

if (typeof module !== 'undefined')
  module.exports = { FIRMA_POLE, FIRMA_SEKCE, DEFAULT_FIRMA, firmaDefault, firmaAktualni,
    firmaPole, firmaHodnota, firmaAdresaRadek, firmaSidlo, firmaKorespondencni, firmaBankaRadek,
    firmaIcoDic, firmaPaticka, firmaPlaceholders, firmaSymboly, firmaRadky, firmaKontrola };
