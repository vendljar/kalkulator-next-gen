/* NÁLEZ V23 — otevřená zahraniční zakázka se počítala tuzemským ceníkem
 * ====================================================================
 *
 * Hlášeno J. V. 4. 9. 2026 po automatizovaném testu. Reprodukce byla stoprocentní:
 * otevřít uloženou zakázku s příznakem Zahraničí → přepínač i štítek dál hlásí
 * „zahraniční ceník", ale VŠECHNY sazby se přepsaly tuzemskými a globální
 * přirážka spadla ze 40 % na 30 %. Nabídka do Koblenz se tím sama podhodnotila
 * zhruba o třetinu (1 381 000 → 908 000 Kč) a nic na to neupozornilo — položka
 * „PŘEKLADY CZ→DE" v kalkulaci zůstala, takže zakázka pořád vypadala zahraničně.
 *
 * PŘÍČINA: dva zdroje pravdy. UI četlo řadu z `data.cenikRada`, ale automatický
 * přepočet při otevření (`cenikPrepoctiRozpracovane`) porovnával variantu vždycky
 * s TUZEMSKÝM ceníkem. Každá zahraniční odchylka se tím tvářila jako zastaralá
 * cena a „srovnala se" na tuzemskou. Přirážku k tomu nechránila značka ručního
 * zásahu, protože ji obchodník nezadal ručně — přišla z ceníku.
 *
 * OPRAVA (v4.9.1) stojí na dvou pravidlech, a obě hlídá tahle sada:
 *   1) ceník se skládá PODLE ŘADY VARIANTY (`cenikDnesniProRadu`),
 *   2) v ROZDĚLANÉ zakázce (má číslo nabídky nebo název akce) jsou přirážka
 *      a sazba DPH rozhodnutím obchodníka a automatika je nepřepisuje (#177) —
 *      kdežto do prázdné nové zakázky se z ceníku natáhnout MAJÍ (#184).
 *
 * Sada schválně nepracuje se skutečnými cenami (ty jsou mimo repozitář):
 * hlídá se, ŽE SE NIC NEZMĚNILO, ne konkrétní koruny.
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./format.js'); nacti('./cenik.js'); nacti('./cenik_stari.js'); nacti('./cenik_rady.js');
nacti('./engine.js'); nacti('./engine_proj.js'); nacti('./techspec.js');
nacti('./zakazka.js'); nacti('./zamek.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* Zkušební ceníky: „dnešní" tuzemský a zahraniční odchylky. Čísla jsou
 * schválně kulatá a smyšlená — ostrý ceník do repozitáře nepatří. */
const cenikProj = () => JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ));
const DNES = () => ({ cenik: Object.assign(ZC.zkusebniCenik(), { marze: 0.27, montazHodKc: 400 }),
                      proj: { cenik: Object.assign(cenikProj(), { marze: 0.55 }) } });
const ZAHR = () => ({
  ceny: { 'C.montazHodKc': 1000, 'C.cestovniKc': 120000, 'C.marze': 0.44, 'PC.marze': 0.66 },
  jenZahr: {},
});

/* Uložená ZAHRANIČNÍ zakázka: má číslo, řadu 'zahr' a v ceníku zahraniční
 * sazby — přesně jak vypadá 2025-OPR-0636-TEST na serveru. */
function zahranicniZakazka() {
  const zak = zajistiZamek(novaZakazka());
  zak.cislo = '2025 - OPR - 0636 - TEST';
  zak.nazevAkce = 'Kornpfortstraße Koblenz';
  const v = zak.varianty[0];
  v.data.cenikRada = 'zahr';
  v.data.cenik = Object.assign(ZC.zkusebniCenik(), {
    marze: 0.44, montazHodKc: 1000, cestovniKc: 120000, rada: 'zahr',
  });
  v.data.proj.cenik = Object.assign(cenikProj(), { marze: 0.66 });
  v.data.cenikRucni = {};          // obchodník nic nepřepisoval ručně
  return zak;
}

/* ---------- 1) složení ceníku pro danou řadu ---------- */
{
  const zahr = cenikDnesniProRadu(DNES(), ZAHR(), 'zahr');
  test('pro zahraniční řadu se vtisknou odchylky OCK',
    zahr.cenik.montazHodKc === 1000 && zahr.cenik.cestovniKc === 120000, zahr.cenik.montazHodKc);
  test('a odchylka přirážky projekce, která bydlí v ceníku PROJ',
    zahr.proj.cenik.marze === 0.66, zahr.proj.cenik.marze);
  test('ceník nese řadu, aby ji poznal i výpočet', zahr.cenik.rada === 'zahr');

  const cr = cenikDnesniProRadu(DNES(), ZAHR(), 'cr');
  test('tuzemská řada zůstává tuzemská', cr.cenik.montazHodKc === 400 && cr.cenik.marze === 0.27);
  test('složení je kopie — dnešní ceník se nezměnil', DNES().cenik.montazHodKc === 400);
}

/* ---------- 2) JÁDRO NÁLEZU: otevření zahraniční zakázky ---------- */
{
  const zak = zahranicniZakazka();
  const d = zak.varianty[0].data;
  const pred = JSON.stringify(d.cenik);
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { zahr: ZAHR(), dnes: '2026-09-04', verze: 7 });

  test('montáž zůstala zahraniční (1 000, ne 400)', d.cenik.montazHodKc === 1000, d.cenik.montazHodKc);
  test('cestovní náklady zůstaly zahraniční', d.cenik.cestovniKc === 120000, d.cenik.cestovniKc);
  test('globální přirážka zůstala na 44 %, nespadla na 27 %', d.cenik.marze === 0.44, d.cenik.marze);
  test('přirážka projekce zůstala taky', d.data === undefined && d.proj.cenik.marze === 0.66, d.proj.cenik.marze);
  test('otevřením se ceník varianty nezměnil ani o kus', JSON.stringify(d.cenik) === pred);
  test('a přepočet o sobě netvrdí, že něco přepočítal', r.prepocteno === 0, JSON.stringify(r));
}

/* ---------- 3) tuzemská zakázka se chová jako dřív ---------- */
{
  const zak = zajistiZamek(novaZakazka());
  zak.cislo = '2026 - OPR - CN - 0248 - TEST';
  const v = zak.varianty[0];
  v.data.cenikRada = 'cr';
  v.data.cenik = Object.assign(ZC.zkusebniCenik(), { marze: 0.20, montazHodKc: 111 });
  v.data.cenikRucni = {};
  cenikPrepoctiRozpracovane(zak, DNES(), { zahr: ZAHR(), dnes: '2026-09-04', verze: 7 });
  test('tuzemská zakázka se srovná s tuzemským ceníkem', v.data.cenik.montazHodKc === 400,
    v.data.cenik.montazHodKc);
  test('ale přirážku 20 % jí nikdo nepřepíše — je to rozhodnutí obchodníka',
    v.data.cenik.marze === 0.20, v.data.cenik.marze);
}

/* ---------- 4) prázdná nová zakázka: #184 platí dál ---------- */
{
  const zak = zajistiZamek(novaZakazka());       // číslo je jen PŘEDLOHA, název prázdný
  const d = zak.varianty[0].data;
  d.cenik.marze = 0.30; d.cenik.montazHodKc = 111;
  cenikPrepoctiRozpracovane(zak, DNES(), { zahr: ZAHR(), dnes: '2026-09-04', verze: 7 });
  test('do prázdné zakázky se přirážka z ceníku pořád natáhne', d.cenik.marze === 0.27, d.cenik.marze);
  test('a náklady s ní', d.cenik.montazHodKc === 400, d.cenik.montazHodKc);
}

/* ---------- 5) uzamčená zahraniční varianta se nedotkne vůbec ---------- */
{
  const zak = zahranicniZakazka();
  const v = zak.varianty[0];
  zamkniVariantu(v, { typ: 'nabidkaOck', kdo: 'test', cislo: 'X' });
  const pred = JSON.stringify(v.data.cenik);
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { zahr: ZAHR(), dnes: '2026-09-04', verze: 7 });
  test('uzamčená (odeslaná) varianta zůstává doklad', JSON.stringify(v.data.cenik) === pred
    && r.zamcene === 1, JSON.stringify(r));
}

/* ---------- 6) bez zahraničních odchylek se nic nemění ----------
 * Pojistka proti opačné chybě: kdyby se skládání řady spletlo, tuzemská
 * zakázka by najednou počítala s prázdnými odchylkami a ceny by zmizely. */
{
  const zak = zahranicniZakazka();
  const d = zak.varianty[0].data;
  cenikPrepoctiRozpracovane(zak, DNES(), { zahr: { ceny: {}, jenZahr: {} }, dnes: '2026-09-04', verze: 7 });
  test('bez odchylek se zahraniční zakázka srovná s tuzemským ceníkem',
    d.cenik.montazHodKc === 400, d.cenik.montazHodKc);
  test('přirážka rozdělané zakázky ale zůstává i tehdy', d.cenik.marze === 0.44, d.cenik.marze);
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
