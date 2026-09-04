/* VYPNUTÝ ŘÁDEK — ruční množství 0 (nález V22, zadání J. V. 4. 9. 2026)
 * =====================================================================
 *
 * „Nula funguje jako množství, tj. vypnutí výpočtu v řádku. Budeme to ale
 * muset nějak v aplikaci rozsvítit, resp. vypnutý řádek zvýraznit."
 *
 * Výpočet nulu respektoval správně už předtím (prázdno není nula) — tahle
 * sada hlídá DVĚ věci:
 *   1) že se to nezměnilo: řádek s ručním množstvím 0 má nulové množství
 *      i náklad, ale ZŮSTÁVÁ v seznamu (jinak by ho nešlo zase zapnout),
 *   2) že ho model označí jako vypnutý — podle toho ho kalkulace ztlumí
 *      a opatří štítkem.
 *
 * Rozlišují se tři různé stavy, které se nesmí slévat: vyřazená položka,
 * nezahrnutá volitelná a vypnutá nulou. Vypočtená nula (položka v téhle
 * šachtě prostě nevychází) vypnutím NENÍ — značit ji by byl jen šum.
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./format.js'); nacti('./prepisy.js');
const eng = require('./engine.js');
Object.keys(eng).forEach(k => { global[k] = eng[k]; });
const ZC = require('./zkusebni_cenik.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const spocti = (uprav) => {
  const z = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
  if (uprav) uprav(z);
  return vypocet(z, ZC.zkusebniCenik(), JEKLY, false);
};
const najdi = (r, sekce, kus) => (r.sekce[sekce] || [])
  .find(x => String(x.origNazev || x.nazev).indexOf(kus) >= 0);

/* ---------- 1) výpočet: nula vypne řádek, ale nesmaže ho ---------- */
{
  const bez = spocti();
  const vzor = (bez.sekce.hrubaOck || [])[0];
  const nazev = String(vzor.origNazev || vzor.nazev);
  test('výchozí řádek něco stojí', vzor.mnozstvi > 0 && vzor.naklad > 0,
    vzor.mnozstvi + ' / ' + vzor.naklad);

  const s0 = spocti(z => { z.mnozstviPrepis = { [nazev]: 0 }; });
  const r0 = (s0.sekce.hrubaOck || []).find(x => String(x.origNazev || x.nazev) === nazev);
  test('řádek s ručním množstvím 0 v seznamu ZŮSTÁVÁ', !!r0);
  test('má nulové množství i náklad', r0 && r0.mnozstvi === 0 && r0.naklad === 0,
    r0 && (r0.mnozstvi + ' / ' + r0.naklad));
  test('a nese značku ručního přepisu', r0 && r0.prepsano === true);
  test('vypočtené množství si pamatuje pro ↺', r0 && r0.mnozstviAuto === vzor.mnozstvi,
    r0 && r0.mnozstviAuto);

  /* Prázdný přepis je něco jiného než nula — „prázdno není nula". */
  const sPrazdno = spocti(z => { z.mnozstviPrepis = { [nazev]: '' }; });
  const rp = (sPrazdno.sekce.hrubaOck || []).find(x => String(x.origNazev || x.nazev) === nazev);
  test('prázdný přepis nechává vypočtené množství', rp && rp.mnozstvi === vzor.mnozstvi,
    rp && rp.mnozstvi);
}

/* ---------- 2) model: kdo je „vypnutý" ---------- */
{
  test('řádek s přepisem na nulu je vypnutý',
    radekVypnutyNulou({ prepsano: true, mnozstvi: 0 }));
  test('řádek s přepisem na jinou hodnotu vypnutý není',
    !radekVypnutyNulou({ prepsano: true, mnozstvi: 3 }));
  test('VYPOČTENÁ nula vypnutím není (položka v šachtě nevychází)',
    !radekVypnutyNulou({ prepsano: false, mnozstvi: 0 }));
  test('řádek bez dat nespadne', !radekVypnutyNulou(null) && !radekVypnutyNulou(undefined));
  test('nula jako řetězec se počítá taky (pole vrací text)',
    radekVypnutyNulou({ prepsano: true, mnozstvi: '0' }));

  test('sekce spočítá, kolik řádků je vypnutých', vypnutychVSekci([
    { prepsano: true, mnozstvi: 0 }, { prepsano: false, mnozstvi: 0 },
    { prepsano: true, mnozstvi: 2 }, { prepsano: true, mnozstvi: 0 },
  ]) === 2);
  test('prázdná sekce dá nulu', vypnutychVSekci([]) === 0 && vypnutychVSekci(null) === 0);
}

/* ---------- 3) model PROJ ---------- */
{
  test('hodinová položka bez hodin je vypnutá',
    polozkaProjVypnuta({ typ: 'hod', hodinyCelkem: 0 }));
  test('hodinová položka s hodinami vypnutá není',
    !polozkaProjVypnuta({ typ: 'hod', hodinyCelkem: 24 }));
  test('vyřazená položka se za vypnutou nepovažuje — má vlastní stav',
    !polozkaProjVypnuta({ typ: 'hod', hodinyCelkem: 0, vyrazeno: true }));
  test('fixní položka s PŘEPSANOU nulou je vypnutá',
    polozkaProjVypnuta({ typ: 'fix', cenaPrepsana: true, cenaEfekt: 0 }));
  test('fixní položka bez ceny z ceníku vypnutá NENÍ (to hlásí „bez ceny")',
    !polozkaProjVypnuta({ typ: 'fix', cenaPrepsana: false, cenaEfekt: 0 }));
}

/* ---------- 4) popisy do bublin existují a mluví o ↺ ---------- */
{
  test('popis pro OCK zmiňuje, jak se to vrátí', /↺/.test(VYPNUTO_POPIS));
  test('popis pro PROJ existuje a mluví o dohodě', /dohoda/.test(VYPNUTO_POPIS_PROJ));
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
