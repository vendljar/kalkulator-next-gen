/* ============================================================
 * TERMÍN DODÁNÍ A PŘIRÁŽKA ZA ATYP (21. 8. 2026, zadání J. V.)
 *
 * „atyp = + 4 týdny v CN termín."
 *
 * PROČ TAHLE SADA
 * Termín jde do nabídky pro zákazníka, takže je to slib. Hlídá se proto:
 *   1) NIC SE NEVYMÝŠLÍ. Bez vyplněné firemní lhůty zůstane termín prázdný
 *      (stejné pravidlo jako u cen) — ATYP z prázdna nesmí udělat číslo.
 *   2) PRODLUŽUJE SE ČÍSLO, NE VĚTA. Lhůta se píše jako „12 týdnů od podpisu
 *      smlouvy"; po atypu z ní musí být „16 týdnů od podpisu smlouvy",
 *      ne „12 týdnů od podpisu smlouvy + 4".
 *   3) POČET TÝDNŮ NENÍ V KÓDU — je v Nastavení → Firma, aby šel změnit.
 *   4) POLE JE V NABÍDCE, tedy vzniká symbol {{PODM_TERMIN_DODANI}}.
 * ============================================================ */
const kr = require('./kryci.js');
const fm = require('./firma.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const T = kr.kryciTerminDodaniText;

/* ---------- 1) nic se nevymýšlí ---------- */

test('bez firemní lhůty je termín prázdný i u atypu', T('', true, '4') === '', T('', true, '4'));
test('bez firemní lhůty je prázdný i bez atypu', T('', false, '4') === '');
test('nula týdnů navíc termín nemění', T('12 týdnů', true, '0') === '12 týdnů');
test('prázdný počet týdnů termín nemění', T('12 týdnů', true, '') === '12 týdnů');

/* ---------- 2) standardní zakázka ---------- */

test('bez atypu se lhůta opíše beze změny',
  T('12 týdnů od podpisu smlouvy', false, '4') === '12 týdnů od podpisu smlouvy');

/* ---------- 3) atyp prodlužuje ---------- */

const s = T('12 týdnů od podpisu smlouvy', true, '4');
test('atyp přičte týdny k číslu, ne k větě', s.indexOf('16 týdnů od podpisu smlouvy') === 0, s);
test('a je z termínu poznat, proč je delší', /ATYP/.test(s), s);
test('jiný počet týdnů z Nastavení se opravdu použije',
  T('12 týdnů', true, '6').indexOf('18 týdnů') === 0, T('12 týdnů', true, '6'));
test('lhůta bez čísla se nezkomolí — jen se doplní poznámka',
  T('dle dohody', true, '4') === 'dle dohody + 4 týdnů (ATYP)', T('dle dohody', true, '4'));

/* ---------- 4) cesta z firemních údajů ---------- */

const firma = fm.firmaDefault();
test('výchozí firemní lhůta je PRÁZDNÁ (nic se nevymýšlí)',
  fm.firmaHodnota(firma, 'terminDodaniOck') === '');
test('výchozí prodloužení za ATYP jsou 4 týdny',
  fm.firmaHodnota(firma, 'terminAtypTydny') === '4');
test('obě pole jsou mezi firemními údaji se správným prefixem',
  ['terminDodaniOck', 'terminAtypTydny'].every(id => {
    const p = fm.firmaPole(id);
    return p && p.sekce === 'Smluvní standardy' && /^FIRMA_/.test(p.symbol);
  }));

firma.terminDodaniOck = '12 týdnů od podpisu smlouvy';
test('prefill krycího listu vezme lhůtu z Nastavení → Firma',
  kr.kryciTerminDodani({ firma, atyp: false }) === '12 týdnů od podpisu smlouvy');
test('a u atypu ji prodlouží',
  kr.kryciTerminDodani({ firma, atyp: true }).indexOf('16 týdnů') === 0,
  kr.kryciTerminDodani({ firma, atyp: true }));

/* ---------- 5) pole opravdu jde do nabídky ---------- */

test('sekce „Termín dodání" v krycím listu existuje',
  kr.KRYCI_SEKCE.some(x => x.sekce === 'Termín dodání'));
test('a je mezi sekcemi, které se ukazují u cenové nabídky',
  kr.KRYCI_NABIDKA_SEKCE.indexOf('Termín dodání') >= 0);
const pole = kr.KRYCI_SEKCE.filter(x => kr.KRYCI_NABIDKA_SEKCE.indexOf(x.sekce) >= 0)
  .reduce((a, x) => a.concat(x.pole), []);
test('vzniká z něj symbol PODM_TERMIN_DODANI', (() => {
  const sym = kr.kryciSymbolyZeSekci(kr.KRYCI_SEKCE, kr.KRYCI_NABIDKA_SEKCE,
    p => (p.id === 'terminDodani' ? '16 týdnů od podpisu smlouvy' : ''));
  return sym.PODM_TERMIN_DODANI === '16 týdnů od podpisu smlouvy'
    && sym.PODM_TERMIN_DODANI_CISLO === '16';
})());
test('a pole není provázané na hlavičku (do nabídky patří jen samostatná pole)',
  pole.filter(p => p.id === 'terminDodani').every(p => !p.bind));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
