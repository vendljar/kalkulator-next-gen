/* Test sluzba.js (#24, krok K2 — 3. 8. 2026)
 *
 * K2 = oddělení výpočtu od obrazovek. Tenhle test je zároveň DŮKAZ, že se
 * povedlo: celý výpočet zakázky (OCK, PROJ, ceny nabídek, marže, kontroly,
 * porovnání variant) tu běží v Node — bez prohlížeče, bez DOM, bez globálního
 * stavu obrazovek. Přesně takhle ho jednou zavolá server na rosti.cz. */
const fs = require('fs');
const eng = require('./engine.js');
const ep = require('./engine_proj.js');
const ZC = require('./zkusebni_cenik.js');
const fm = require('./format.js');
const sl = require('./sleva.js');
const zo = require('./zaokrouhleni.js');
const tsm = require('./techspec.js');
Object.assign(global, eng, ep, fm, sl, zo, tsm);
global.DEFAULT_CENIK = ZC.zkusebniCenik(); global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const zk = require('./zakazka.js');
Object.assign(global, zk);
const mz = require('./marze.js');
Object.assign(global, mz);
const ko = require('./kontroly.js');
Object.assign(global, ko);
const sluzba = require('./sluzba.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

/* modul nesmí sahat na DOM ani na stav obrazovek — jinak na serveru nepoběží */
const zdroj = fs.readFileSync(__dirname + '/sluzba.js', 'utf8');
test('sluzba.js nesahá na DOM (document/window)', !/document\.|window\./.test(zdroj));
test('sluzba.js nevolá render()', !/\brender\(/.test(zdroj));
test('sluzba.js nečte globální stav obrazovek (ZAK, NAST, SL, ZO)',
  !/\b(ZAK|NAST|SL|ZO)\b\s*[.=]/.test(zdroj.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));

const program = { cenik: ZC.zkusebniCenik(), cenikProj: ZC.zkusebniCenikProj(),
                  slevy: { minMarze: 0.10, maxGlobalni: 0.30, stropy: { 'Obchodník': 0.05 } } };
const zak = zk.novaZakazka();
zak.cislo = '2026 - OPR - CN - 0900';
const v1 = zak.varianty[0];
v1.data.sleva = { procenta: 10, stav: 'schváleno', role: 'Vedoucí' };

const vysl = sluzba.sluzbaVypocet(zak, program, JEKLY);
test('výsledek nese všechny varianty', vysl.varianty.length === 1 && vysl.varianty[0].id === v1.id);
const r = vysl.varianty[0];
test('OCK i PROJ jsou spočtené', !!(r.ock && r.ock.souhrn) && !!(r.proj && r.proj.souhrn));

/* stejná čísla jako přímé volání jader — služba je jen orchestrace, ne nový výpočet */
const primoOck = zo.cenaNabidkyOck(eng.vypocet(v1.data.ock.zadani, v1.data.cenik, JEKLY, v1.data.ock.fixes),
                                   v1.data.sleva, v1.data.zaokr);
test('cena nabídky OCK sedí s přímým voláním jádra',
  r.cenaOck && Math.abs(r.cenaOck.cena - primoOck.cena) < 1e-9, JSON.stringify(r.cenaOck));
const primoProj = zo.cenaNabidkyProj(ep.vypocetProj(v1.data.proj.zadani, v1.data.proj.cenik), v1.data.zaokr);
test('cena nabídky PROJ sedí s přímým voláním jádra',
  r.cenaProj && Math.abs(r.cenaProj.cena - primoProj.cena) < 1e-9);

test('marže nabídky je spočtená a zná minimum z programu',
  r.marze && r.marze.min === 0.10);
test('kontroly proběhly a vrací seznam nálezů', r.kontroly && Array.isArray(r.kontroly.nalezy));
test('porovnání variant je součástí výsledku',
  vysl.porovnani && Array.isArray(vysl.porovnani.metriky) && vysl.porovnani.varianty.length === 1);

/* zakázka „jen projekce" platí i ve službě */
const zakJP = zk.novaZakazka(); zakJP.jenProj = true;
const vyslJP = sluzba.sluzbaVypocet(zakJP, program, JEKLY);
test('jen projekce: kontroly OCK mlčí i ve službě',
  !vyslJP.varianty[0].kontroly.kody.includes('rozmery'),
  vyslJP.varianty[0].kontroly.kody.join(','));
test('jen projekce: porovnání bez části OCK',
  vyslJP.porovnani.varianty[0].hodnoty.ockZaklad == null);

/* rozbitá varianta nesmí shodit celou službu (server nesmí spadnout na datech) */
const zakRozbita = zk.novaZakazka();
zakRozbita.varianty[0].data.ock = null;
const vyslR = sluzba.sluzbaVypocet(zakRozbita, program, JEKLY);
test('rozbitá varianta službu neshodí', vyslR.varianty.length === 1 && vyslR.varianty[0].ock === null);

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
