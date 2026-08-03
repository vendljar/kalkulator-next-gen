/* Test sleva.js (ZAK-10) – vyhodnocení stropů/marže + propis schválené slevy do nabídky. */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const sl = require('./sleva.js');
Object.assign(global, sl);
global.slevaPodil = sl.slevaPodil; global.slevaDefault = sl.slevaDefault;
const { nabidkaData } = require('./nabidka.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
/* UKÁZKOVÁ slevová politika. Kolik smí která role dát bez schválení a pod
 * jakou marži se nesmí jít je obchodní tajemství – skutečná čísla leží ve
 * složce _DB (_program.json) a do repozitáře nepatří ani jako testovací
 * vzorek. Testy níž se na hodnoty odkazují přes tyhle konstanty, aby šlo
 * vzorek vyměnit a nemuselo se přepisovat dvacet očekávání. */
const STROP_OBCH = 5;      // %
const STROP_REDITEL = 15;  // %
const nast = {
  minMarze: 0.10,
  stropy: {
    'Obchodník': STROP_OBCH / 100, 'Vedoucí obchodu': 0.10,
    'Obchodní ředitel': STROP_REDITEL / 100, 'Jednatel': 1,
  },
};
const DO_STROPU = STROP_OBCH;          // přesně na stropu obchodníka
const NAD_STROP = STROP_OBCH + 2;      // nad ním, ale pod stropem ředitele

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9001'; zak.varianty[0].data.ock.fixes = true;
const v = zak.varianty[0];
const r = eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, true);
const zaklad = r.souhrn.zakladCena, naklad = r.souhrn.zakladNaklad;
console.log('   (základ ' + Math.round(zaklad) + ' Kč, náklad ' + Math.round(naklad) + ' Kč, marže '
  + (Math.round((zaklad - naklad) / zaklad * 1000) / 10) + ' %)');

// 1) bez slevy
const v0 = sl.slevaVyhodnot(zaklad, naklad, { procenta: 0, role: 'Obchodník' }, nast);
test('0 % → prázdný stav', v0.stav === '' && v0.slevaKc === 0);

// 2) do stropu role → auto
const v3 = sl.slevaVyhodnot(zaklad, naklad, { procenta: DO_STROPU, role: 'Obchodník' }, nast);
test('sleva na stropu obchodníka → schváleno automaticky', v3.stav === 'schváleno automaticky', v3.stav);

// 3) nad strop role, marže ok → čeká
const v5 = sl.slevaVyhodnot(zaklad, naklad, { procenta: NAD_STROP, role: 'Obchodník' }, nast);
test('nad strop obchodníka → čeká na schválení', v5.stav === 'čeká na schválení', v5.stav);
// stejná sleva vyšší rolí projde automaticky
const v5r = sl.slevaVyhodnot(zaklad, naklad, { procenta: NAD_STROP, role: 'Obchodní ředitel' }, nast);
test('táž sleva pod stropem ředitele → schváleno automaticky', v5r.stav === 'schváleno automaticky', v5r.stav);

// 4) pod minimální marží → zamítnuto (i pro jednatele bez limitu %)
const vBig = sl.slevaVyhodnot(zaklad, naklad, { procenta: 40, role: 'Jednatel' }, nast);
test('40 % → pod min. marží → zamítnuto', vBig.stav === 'zamítnuto' && vBig.podMarzi, vBig.stav + ' marže ' + vBig.marzePoSleve);

// 5) slevaPodil aplikuje jen schválené
test('podíl: čeká = 0', sl.slevaPodil({ procenta: 5, stav: 'čeká na schválení' }) === 0);
test('podíl: auto = 0.05', Math.abs(sl.slevaPodil({ procenta: 5, stav: 'schváleno automaticky' }) - 0.05) < 1e-9);
test('podíl: schváleno = 0.1', Math.abs(sl.slevaPodil({ procenta: 10, stav: 'schváleno' }) - 0.1) < 1e-9);

// 6) propis do nabídky
const parse = s => parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.'));
const dBez = nabidkaData(zak, v, JEKLY);
const cenaBez = parse(dBez.placeholders.CENA_BEZ_DPH);
v.data.sleva = { procenta: 10, role: 'Obchodní ředitel', stav: 'schváleno' };
const dSleva = nabidkaData(zak, v, JEKLY);
const cenaSleva = parse(dSleva.placeholders.CENA_BEZ_DPH);
test('schválená 10% sníží cenu nabídky ~o 10 %', Math.abs(cenaSleva - cenaBez * 0.9) < 2, cenaBez + ' → ' + cenaSleva);
test('placeholder SLEVA_PROC = 10', dSleva.placeholders.SLEVA_PROC === '10', dSleva.placeholders.SLEVA_PROC);
test('placeholder CENA_PRED_SLEVOU = původní', Math.abs(parse(dSleva.placeholders.CENA_PRED_SLEVOU) - cenaBez) < 2);
// neschválená sleva se NEpropíše
v.data.sleva = { procenta: 10, role: 'Obchodník', stav: 'čeká na schválení' };
test('čekající sleva cenu nemění', Math.abs(parse(nabidkaData(zak, v, JEKLY).placeholders.CENA_BEZ_DPH) - cenaBez) < 2);


/* ---------- zjednodušení rolí (2. 8. 2026) ----------
 * „Zatím bych role zjednodušil na obchodník, vedoucí a administrátor."
 * Starší data (zakázky, _nastaveni.json, _program.json) nesou čtyři původní
 * role — migrace je převádí a při sloučení dvou rolí do jedné bere vyšší
 * strop, aby se nikomu potichu nesnížilo oprávnění, které už měl. */
test('výchozí role jsou tři', Array.isArray(ROLE_VYCHOZI)
  && ROLE_VYCHOZI.join('|') === 'Obchodník|Vedoucí|Administrátor');
test('stará role se převede', roleMigruj('Vedoucí obchodu') === 'Vedoucí'
  && roleMigruj('Obchodní ředitel') === 'Vedoucí' && roleMigruj('Jednatel') === 'Administrátor');
test('nová i neznámá role projde beze změny', roleMigruj('Obchodník') === 'Obchodník'
  && roleMigruj('Externista') === 'Externista');
test('seznam rolí se převede bez duplicit a se zachováním pořadí',
  roleMigrujSeznam(['Obchodník', 'Vedoucí obchodu', 'Obchodní ředitel', 'Jednatel']).join('|')
    === 'Obchodník|Vedoucí|Administrátor');
test('stropy: při sloučení rolí platí vyšší strop', (() => {
  const s2 = stropyMigruj({ 'Obchodník': 0.05, 'Vedoucí obchodu': 0.10, 'Obchodní ředitel': 0.15, 'Jednatel': 1 });
  return s2['Vedoucí'] === 0.15 && s2['Administrátor'] === 1 && s2['Obchodník'] === 0.05
    && !('Vedoucí obchodu' in s2) && !('Jednatel' in s2);
})());
test('stropy: neznámá role zůstává', stropyMigruj({ 'Externista': 0.02 })['Externista'] === 0.02);

/* migrace rolí při načtení starší zakázky: nezamčená varianta se převede,
 * zamčená zůstává jak odešla (je to doklad) */
{
  global.roleMigruj = sl.roleMigruj;   // v prohlížeči je globální díky buildu
  const zam = (typeof global.variantaUzamcena === 'function');
  const stara = JSON.parse(JSON.stringify(zk.novaZakazka()));
  stara.varianty[0].data.sleva = { procenta: 8, role: 'Obchodní ředitel',
    stav: 'schváleno', schvalitel: 'Jednatel' };
  const po = zk.importZakazka(stara);
  test('import převede roli slevy nezamčené varianty',
    po.varianty[0].data.sleva.role === 'Vedoucí'
    && po.varianty[0].data.sleva.schvalitel === 'Administrátor',
    JSON.stringify(po.varianty[0].data.sleva));
}

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY SLEVA OK');
process.exit(fail ? 1 : 0);
