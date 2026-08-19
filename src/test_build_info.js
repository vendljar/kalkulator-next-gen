/* Test #40 – stáří sestavení.
 *
 * Modul má jednu vlastnost, která se snadno rozbije a těžko všimne: v Node
 * (a v ručně rozbitém souboru) se značky __VERZE__ / __SESTAVENO__ nikdy
 * nenahradí. Kdyby je funkce vydávaly tak, jak jsou, aplikace by počítala
 * stáří z řetězce „__SESTAVENO__" a tvrdila nesmysly. Proto se tady kontroluje
 * hlavně to, že se v nenahrazeném stavu MLČÍ. */
const bi = require('./build_info.js');
const { buildVerze, buildDatum, buildDniOd, buildStari, buildDatumCz,
        buildStariText, BUILD_STARI_DNU } = bi;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- 1) nenahrazené značky ---------- */
test('nenahrazená značka verze se ven nedostane', buildVerze() === '', buildVerze());
test('nenahrazená značka data se ven nedostane', buildDatum() === '', buildDatum());
test('bez data sestavení se o stáří nic netvrdí', buildStari('2026-07-29').stupen === ''
  && buildStari('2026-07-29').dni === null);
test('bez data sestavení je věta prázdná', buildStariText(buildStari('2026-07-29')) === '');

/* ---------- 2) počítání dnů ---------- */
test('stejný den = 0 dní', buildDniOd('2026-07-29', '2026-07-29') === 0);
test('den zpátky = 1 den', buildDniOd('2026-07-28', '2026-07-29') === 1);
test('přes přelom roku', buildDniOd('2025-12-31', '2026-01-01') === 1);
test('přes přestupný den 2028', buildDniOd('2028-02-28', '2028-03-01') === 2);
test('nesmyslný vstup vrací null', buildDniOd('včera', '2026-07-29') === null
  && buildDniOd('', '2026-07-29') === null && buildDniOd(null, '2026-07-29') === null);
test('nesmyslné „dnes" vrací null', buildDniOd('2026-01-01', 'dnes') === null);

/* ---------- 3) hranice ----------
 * Hranice se čtou z BUILD_STARI_DNU, ne z opsaných čísel – kdyby je někdo
 * posunul, test má spadnout jen tehdy, když se rozejde chování, ne hodnota. */
const S = BUILD_STARI_DNU;
const st = (dni) => {
  const d = new Date(Date.UTC(2026, 6, 29) - dni * 86400000).toISOString().slice(0, 10);
  return buildStari('2026-07-29', d);
};
test('čerstvé sestavení mlčí', st(0).stupen === '' && st(1).stupen === '');
test('den před hranicí ještě mlčí', st(S.starsi - 1).stupen === '');
test(`na hranici ${S.starsi} dní se ozve mírně`, st(S.starsi).stupen === 'starsi');
test('mezi hranicemi zůstává mírné', st(S.stare - 1).stupen === 'starsi');
test(`na hranici ${S.stare} dní se ozve důrazněji`, st(S.stare).stupen === 'stare');
test('hodně staré zůstává důrazné', st(900).stupen === 'stare');
test('hranice jsou seřazené', S.starsi < S.stare);

/* ---------- 4) hodnoty ve výsledku ---------- */
const s120 = st(120);
test('výsledek nese datum sestavení', /^\d{4}-\d{2}-\d{2}$/.test(s120.datum), s120.datum);
test('výsledek nese počet dní', s120.dni === 120, s120.dni);

/* ---------- 5) datum v české podobě ---------- */
test('datum bez nul navíc', buildDatumCz('2026-01-06') === '6. 1. 2026', buildDatumCz('2026-01-06'));
test('dvouciferný den i měsíc', buildDatumCz('2025-11-04') === '4. 11. 2025');
test('nesmysl se vrací tak, jak přišel', buildDatumCz('__SESTAVENO__') === '__SESTAVENO__');

/* ---------- 6) věta ---------- */
const vetaMirna = buildStariText(st(S.starsi + 5));
const vetaDurazna = buildStariText(st(S.stare + 5));
test('mírná věta uvede datum i počet dní',
  vetaMirna.includes('. 2026') && /před \d+ dny/.test(vetaMirna), vetaMirna);
test('mírná věta nedělá z stáří chybu', vetaMirna.includes('Není to nutně chyba'), vetaMirna);
test('důraznější věta mluví o odeslání nabídky',
  vetaDurazna.includes('nabídku'), vetaDurazna);
test('ani jedna věta nic nepřikazuje ani neblokuje',
  !/nesmí|zakázán|blokov/i.test(vetaMirna + vetaDurazna));
test('čerstvé sestavení nemá co říct', buildStariText(st(0)) === '');
test('věta bez vstupu nespadne', buildStariText(null) === '' && buildStariText({}) === '');

/* ---------- 7) hlídka nasazené verze (19. 8. 2026) ----------
 * Aplikace je stránka, která zůstává otevřená celé dny; mezitím se nasadí
 * nová dávka a člověk počítá na staré verzi, aniž to tuší (v18.8.1 ×
 * v18.8.2). Hlídka porovná verzi otevřené stránky s verzí ze serveru
 * (/api/zdravi čte verze.txt z nasazeného repozitáře) a řekne, co dělat. */
const { buildVerzeHlaska } = require('./build_info.js');
test('shodné verze mlčí', buildVerzeHlaska('v18.8.2', '18.8.2') === '');
test('rozdíl verzí vrátí větu s oběma čísly a výzvou k obnovení',
  /v18\.8\.2/.test(buildVerzeHlaska('v18.8.1', '18.8.2'))
  && /v18\.8\.1/.test(buildVerzeHlaska('v18.8.1', '18.8.2'))
  && /[Oo]bnov/.test(buildVerzeHlaska('v18.8.1', '18.8.2')),
  buildVerzeHlaska('v18.8.1', '18.8.2'));
test('bez vlastní verze (vývoj, testy) mlčí', buildVerzeHlaska('', '18.8.2') === '');
test('bez serverové verze mlčí', buildVerzeHlaska('v18.8.1', '') === ''
  && buildVerzeHlaska('v18.8.1', null) === '');
test('serverové „neznámá" mlčí', buildVerzeHlaska('v18.8.1', 'neznámá') === '');
test('v/bez v na začátku nehraje roli', buildVerzeHlaska('18.8.2', 'v18.8.2') === '');

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
