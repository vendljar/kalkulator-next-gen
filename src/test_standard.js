/* ============================================================
 * STANDARD OCK (#163, 21. 8. 2026)
 *
 * PROČ TAHLE SADA
 * Kontrola standardu nic neblokuje, takže se její chyba nepozná pádem —
 * jen tichým „zeleno" tam, kde má být červená (nebo naopak). Sada proto
 * hlídá čtyři věci, na kterých celé hlídání stojí:
 *
 *  1) TŘI STAVY. „mimo standard" musí přebít „nelze posoudit" — jinak by
 *     stačilo nevyplnit hloubku můstku a atyp by se schoval.
 *  2) PRÁZDNO NENÍ NULA. Nevyplněný rozměr je „nelze posoudit", ne splněný
 *     limit. (Přesně tuhle chybu měla první verze: `+''` je v JavaScriptu 0.)
 *  3) SPRÁVNÁ VĚTEV. Exteriér a interiér mají jiné profily i jiné limity;
 *     interiér navíc jiné limity PRO KAŽDÝ PROFIL.
 *  4) LIMITY Z NASTAVENÍ, NE Z KÓDU. Změna tabulky musí okamžitě změnit
 *     výsledek — jinak by se standard nedal měnit bez nové dávky.
 * ============================================================ */
const S = require('./standard_ock.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const std = () => { const s = JSON.parse(JSON.stringify(S.STANDARD_VYCHOZI)); s.zapnuto = true; return s; };
const ext = (zmeny) => Object.assign({
  typSachty: 'exteriérová', sirka: 1.8, hloubka: 1.9,
  profily: { sloupek: { dim: '80x80' } }, zaskleni: 'na terče',
}, zmeny || {});
const int = (zmeny) => Object.assign({
  typSachty: 'interiérová', sirka: 1.5, hloubka: 1.5,
  profily: { sloupek: { dim: '80x50' } }, zaskleni: 'na terče',
}, zmeny || {});

/* ---------- 1) vypínač ---------- */

test('vypnutá kontrola nic nevyhodnocuje (výchozí stav)',
  S.standardVyhodnot(ext(), 20, S.STANDARD_VYCHOZI).stav === 'vypnuto');
test('a nekreslí ani popisek', S.standardPopis(S.standardVyhodnot(ext(), 20, S.STANDARD_VYCHOZI)) === '');
test('výchozí znění má kontrolu VYPNUTOU (zabíhá se)', S.STANDARD_VYCHOZI.zapnuto === false);

/* ---------- 2) exteriér ---------- */

test('standardní venkovní šachta projde',
  S.standardVyhodnot(ext(), 25, std()).stav === 'standard');
test('cizí profil je atyp',
  S.standardVyhodnot(ext({ profily: { sloupek: { dim: '120x120' } } }), 25, std()).stav === 'atyp');
test('výška nad 30 m je atyp',
  S.standardVyhodnot(ext(), 31, std()).stav === 'atyp');
test('hloubka nad 2000 mm je atyp',
  S.standardVyhodnot(ext({ hloubka: 2.48 }), 25, std()).stav === 'atyp');
const dvaNalezy = S.standardVyhodnot(ext({ hloubka: 2.48, profily: { sloupek: { dim: '120x120' } } }), 25, std());
test('dva prohřešky = dva nálezy', dvaNalezy.nalezy.length === 2, JSON.stringify(dvaNalezy.nalezy));
test('nález nese limit i zadanou hodnotu',
  dvaNalezy.nalezy.some(n => n.limit === 'max 2000 mm' && n.zadano === '2480 mm'),
  JSON.stringify(dvaNalezy.nalezy));
test('popisek počítá jen skutečné prohřešky',
  S.standardPopis(dvaNalezy) === 'ATYP OCK · 2 nálezy', S.standardPopis(dvaNalezy));

/* ---------- 3) interiér: limity podle profilu ---------- */

test('profil 80x50 snese hloubku 2500 mm',
  S.standardVyhodnot(int({ hloubka: 2.5 }), 25, std()).stav === 'standard');
test('týž rozměr je u profilu 80x40 atyp',
  S.standardVyhodnot(int({ hloubka: 2.5, profily: { sloupek: { dim: '80x40' } } }), 25, std()).stav === 'atyp');
test('profil 80x40 má nižší strop výšky (25 m)',
  S.standardVyhodnot(int({ profily: { sloupek: { dim: '80x40' } } }), 27, std()).stav === 'atyp'
  && S.standardVyhodnot(int(), 27, std()).stav === 'standard');
test('exteriérový profil ve vnitřní šachtě je atyp',
  S.standardVyhodnot(int({ profily: { sloupek: { dim: '100x100' } } }), 20, std()).stav === 'atyp');
test('u neznámého profilu se rozměry neposuzují proti cizí tabulce',
  S.standardVyhodnot(int({ hloubka: 9, profily: { sloupek: { dim: '999x999' } } }), 20, std()).nalezy.length === 1);
test('zápis profilu se srovnává (80 × 80 = 80x80)',
  S.standardNormProfil('80 × 80') === '80x80' && S.standardNormProfil('80X80') === '80x80');
test('sklo do rámečku místo terčů je v interiéru atyp',
  S.standardVyhodnot(int({ zaskleni: 'do rámečku' }), 20, std()).stav === 'atyp');

/* ---------- 4) můstek a třetí stav ---------- */

test('bez můstku se rozměry můstku neřeší',
  S.standardVyhodnot(int(), 20, std()).stav === 'standard');
const bezRozmeru = S.standardVyhodnot(int({ mustek: true }), 20, std());
test('můstek bez rozměrů = NELZE POSOUDIT, ne atyp',
  bezRozmeru.stav === 'nelze', bezRozmeru.stav);
test('a řekne, který údaj chybí',
  bezRozmeru.nalezy.every(n => n.stav === 'nelze')
  && bezRozmeru.nalezy.some(n => /Hloubka můstku/.test(n.co)));
test('vyplněný můstek v limitu projde',
  S.standardVyhodnot(int({ mustek: true, mustekHloubkaMm: 800, mustekSirkaMm: 1400 }), 20, std()).stav === 'standard');
test('hloubka můstku nad 1000 mm je atyp',
  S.standardVyhodnot(int({ mustek: true, mustekHloubkaMm: 1200, mustekSirkaMm: 1400 }), 20, std()).stav === 'atyp');
test('šířka můstku nad šířku OCK je atyp',
  S.standardVyhodnot(int({ mustek: true, mustekHloubkaMm: 800, mustekSirkaMm: 1600 }), 20, std()).stav === 'atyp');
/* Klíčové pravidlo: chybějící údaj nesmí zakrýt skutečný prohřešek. */
const skryvani = S.standardVyhodnot(int({ hloubka: 9, mustek: true }), 20, std());
test('„mimo standard" přebíjí „nelze posoudit" (atyp se nedá schovat)',
  skryvani.stav === 'atyp', skryvani.stav);
/* Nula je platný rozměr, prázdno ne — „prázdno není nula" (pravidlo #8). */
test('nulová hloubka můstku je platná hodnota, ne chybějící údaj',
  S.standardVyhodnot(int({ mustek: true, mustekHloubkaMm: 0, mustekSirkaMm: 0 }), 20, std()).stav === 'standard');

/* ---------- 5) jeden typ zasklení ---------- */

/* Dvě skla v nabídce nejsou automaticky atyp: můžou to být dvě VARIANTY
 * pro zákazníka. Aplikace to z dat nerozezná, takže se ptá — proto „nelze
 * posoudit", ne červená (zásada 3: falešný atyp učí lidi štítek ignorovat). */
const dveSkla = S.standardVyhodnot(int(), 20, std(), ['Sklo VSG', 'Sklo SKN 176']);
test('dva druhy skla v nabídce se ptají, netvrdí atyp', dveSkla.stav === 'nelze', dveSkla.stav);
test('a nález vysvětluje, na co se ptá',
  /varianty pro zákazníka/.test(dveSkla.nalezy[0].zadano));
test('jeden druh skla projde',
  S.standardVyhodnot(int(), 20, std(), ['Sklo VSG']).stav === 'standard');
test('vypnuté pravidlo se nekontroluje', (() => {
  const s = std(); s.jedenTypZaskleni = false;
  return S.standardVyhodnot(int(), 20, s, ['Sklo VSG', 'Sklo SKN 176']).stav === 'standard';
})());

/* ---------- 6) limity opravdu z tabulky, ne z kódu ---------- */

test('změna limitu v Nastavení hned mění výsledek', (() => {
  const s = std(); s.exterier.hloubkaMaxMm = 2500;
  return S.standardVyhodnot(ext({ hloubka: 2.48 }), 25, s).stav === 'standard';
})());
test('přidaný profil do interiéru se hned uzná', (() => {
  const s = std();
  s.interier.profily.push({ profil: '100x60', vyskaMaxM: 20, sirkaMaxMm: 2000, hloubkaMaxMm: 2000 });
  return S.standardVyhodnot(int({ profily: { sloupek: { dim: '100x60' } } }), 19, s).stav === 'standard';
})());

/* ---------- 7) očista uloženého standardu ---------- */

const oc = S.standardOciste({ zapnuto: true, exterier: { vyskaMaxM: -5, sirkaMaxMm: 'nesmysl' },
  interier: { profily: [{ profil: '' }] }, necoCizi: 1 });
test('nesmyslný limit se zahodí a platí výchozí',
  oc.exterier.vyskaMaxM === S.STANDARD_VYCHOZI.exterier.vyskaMaxM
  && oc.exterier.sirkaMaxMm === S.STANDARD_VYCHOZI.exterier.sirkaMaxMm);
test('řádek bez profilu se zahodí', oc.interier.profily.length === 2);
test('neznámý klíč se neuloží', oc.necoCizi === undefined);
test('očista bez vstupu vrátí výchozí znění s vypnutou kontrolou',
  S.standardOciste(null).zapnuto === false);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
