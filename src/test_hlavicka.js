/* Test: dvě nezávislé hlavičky (OCK / PROJ), migrace starých zakázek a ruční přenos. */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./engine.js'); nacti('./engine_proj.js'); nacti('./techspec.js'); nacti('./zakazka.js');

let fails = 0, passes = 0;
function test(name, cond, info) {
  if (cond) { passes++; console.log('  ok  ' + name); }
  else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
}

// ---- nová zakázka má obě hlavičky, PROJ se stejným tvarem čísla --------------
const z = novaZakazka();
test('nová zakázka má hlavičku PROJ', !!z.projHlavicka, Object.keys(z));
test('výchozí číslo nabídky PROJ má stejný tvar jako OCK',
  z.projHlavicka.cislo === z.cislo, [z.cislo, z.projHlavicka.cislo]);
ZAK_HLAVICKA_POLE.forEach(k =>
  test('hlavička PROJ obsahuje pole ' + k, z.projHlavicka[k] != null, z.projHlavicka));

// ---- zápis do jedné hlavičky nemění druhou ---------------------------------
z.objednatel = 'Stavba a.s.'; z.nazevAkce = 'Výtah OCK'; z.cislo = 'CN-OCK-1';
test('zápis do OCK nezmění objednatele PROJ', z.projHlavicka.objednatel === '', z.projHlavicka);
test('zápis do OCK nezmění číslo PROJ', z.projHlavicka.cislo !== 'CN-OCK-1', z.projHlavicka);
z.projHlavicka.objednatel = 'Projekce s.r.o.';
test('zápis do PROJ nezmění objednatele OCK', z.objednatel === 'Stavba a.s.', z.objednatel);
test('odlišné hlavičky se hlásí jako odlišné', zakazkaHlavickyShodne(z) === false);

// ---- ruční přenos oběma směry ----------------------------------------------
const kolizeDoProj = zakazkaHlavickaKolize(z, 'doProj');
test('kolize hlásí neprázdná odlišná pole PROJ', kolizeDoProj.indexOf('objednatel') >= 0, kolizeDoProj);
test('kolize nehlásí prázdné pole PROJ', kolizeDoProj.indexOf('adresa') < 0, kolizeDoProj);

zakazkaKopirujHlavicku(z, 'doProj');
test('přenos OCK → PROJ zkopíruje objednatele', z.projHlavicka.objednatel === 'Stavba a.s.');
test('přenos OCK → PROJ zkopíruje číslo nabídky', z.projHlavicka.cislo === 'CN-OCK-1');
test('po přenosu jsou hlavičky shodné', zakazkaHlavickyShodne(z) === true);
test('přenos OCK → PROJ nezmění hlavičku OCK', z.objednatel === 'Stavba a.s.' && z.cislo === 'CN-OCK-1');

z.projHlavicka.cislo = 'CN-PROJ-9';
test('úprava po přenosu se nevrací do OCK', z.cislo === 'CN-OCK-1', z.cislo);
zakazkaKopirujHlavicku(z, 'doOck');
test('přenos PROJ → OCK zkopíruje číslo nabídky', z.cislo === 'CN-PROJ-9', z.cislo);

// ---- migrace staré zakázky (bez projHlavicka) ------------------------------
const stara = novaZakazka();
delete stara.projHlavicka;
stara.cislo = 'CN-STARE-1'; stara.nazevAkce = 'Stará akce'; stara.objednatel = 'Starý objednatel';
stara.adresa = 'Stará 1'; stara.kontakt = 'Stará osoba';
const dphOck = 0.12;
stara.varianty.forEach(v => { v.data.cenik.dph = dphOck; delete v.data.proj.cenik.dph; });

const m = importZakazka(JSON.parse(JSON.stringify(stara)));
test('migrace doplní hlavičku PROJ', !!m.projHlavicka);
ZAK_HLAVICKA_POLE.forEach(k =>
  test('migrace převezme pole ' + k + ' z hlavičky OCK', m.projHlavicka[k] === stara[k],
    [m.projHlavicka[k], stara[k]]));
test('migrace doplní sazbu DPH PROJ z ceníku OCK (čísla se nezmění)',
  m.varianty[0].data.proj.cenik.dph === dphOck, m.varianty[0].data.proj.cenik.dph);

// po migraci už jsou hlavičky nezávislé
m.projHlavicka.cislo = 'CN-PROJ-MIG';
test('po migraci jsou hlavičky nezávislé', m.cislo === 'CN-STARE-1', m.cislo);

// ---- čtení hlavičky PROJ u cizích dat bez zápisu ----------------------------
const cizi = { cislo: 'X-1', nazevAkce: 'X', adresa: 'Xa', objednatel: 'Xo', kontakt: 'Xk', datum: '2026-01-01' };
const h = projHlavicka(cizi);
test('projHlavicka() u dat bez hlavičky vrátí údaje OCK', h.cislo === 'X-1' && h.objednatel === 'Xo', h);
test('projHlavicka() nezapisuje do zdrojových dat', cizi.projHlavicka === undefined);

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
