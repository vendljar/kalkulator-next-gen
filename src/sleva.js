/* ============================================================
 * SLEVY (ZAK-10) – výpočet dopadu slevy + stav schválení.
 * Sleva se zadává na úrovni varianty (nabídky) jako % z ceny bez DPH.
 * Tři vrstvy: pojistka marže (tvrdý strop) → strop dle role (bez schválení)
 * → schvalování nadřízeným nad rámec stropu. Konfigurace (stropy, minMarže)
 * je v NAST.slevy (session); tady je čistý výpočet, testovatelný bez UI.
 * ============================================================ */

function slevaDefault() {
  return { procenta: 0, schema: '', role: 'Obchodník', poznamka: '',
           stav: '', schvalil: '', schvalilKdy: '' };
}

/* Vyhodnotí slevu. Vrací dopad + navržený stav.
 *  zaklad  = cena bez DPH (s přirážkou)      naklad = náklad bez přirážky
 *  sleva   = {procenta (v %), role}          nast   = {minMarze, stropy{role:podíl}}
 * stav: '' (bez slevy) | 'zamítnuto' (pod min. marží) | 'čeká na schválení'
 *       (nad strop role) | 'schváleno automaticky' (v mezích). */
function slevaVyhodnot(zaklad, naklad, sleva, nast) {
  nast = nast || {};
  const p = Math.max(0, +sleva.procenta || 0) / 100;
  const slevaKc = zaklad * p;
  const cenaPoSleve = zaklad - slevaKc;
  const marzePoSleve = cenaPoSleve > 0 ? (cenaPoSleve - naklad) / cenaPoSleve : -1;
  const strop = (nast.stropy && nast.stropy[sleva.role] != null) ? nast.stropy[sleva.role] : 0;
  const minMarze = nast.minMarze || 0;
  const podMarzi = p > 0 && marzePoSleve < minMarze - 1e-9;
  const nadStrop = p > strop + 1e-9;
  let stav = '';
  if (p > 0) stav = podMarzi ? 'zamítnuto' : (nadStrop ? 'čeká na schválení' : 'schváleno automaticky');
  return { procenta: p, slevaKc, cenaPoSleve, marzePoSleve, strop, minMarze, podMarzi, nadStrop, stav };
}

/* Je sleva k propsání do nabídky (tj. schválená)? */
function slevaPlati(sleva) {
  return !!sleva && +sleva.procenta > 0 && (sleva.stav === 'schváleno automaticky' || sleva.stav === 'schváleno');
}
/* Podíl slevy (0..1) k použití v nabídce – jen je-li schválená. */
function slevaPodil(sleva) { return slevaPlati(sleva) ? Math.max(0, +sleva.procenta || 0) / 100 : 0; }


/* ---------- role (zjednodušení 2. 8. 2026) ----------------------------
 * „Zatím bych role zjednodušil na obchodník, vedoucí a administrátor."
 * Tři role jsou příprava na online přihlašování (#24): obchodník zadává,
 * vedoucí schvaluje slevy nad strop, administrátor vidí náklady a spravuje
 * ceník. Starší data (uložené zakázky, _nastaveni.json, _program.json)
 * nesou čtyři původní role — migrace je převádí na nové a při sloučení
 * dvou starých rolí do jedné bere VYŠŠÍ strop: potichu snížit oprávnění,
 * které někdo už měl, by znamenalo, že se rozpracovaná sleva po otevření
 * zakázky začne tvářit jako neschválená. */
const ROLE_VYCHOZI = ['Obchodník', 'Vedoucí', 'Administrátor'];
const ROLE_MIGRACE = {
  'Vedoucí obchodu': 'Vedoucí',
  'Obchodní ředitel': 'Vedoucí',
  'Jednatel': 'Administrátor',
};
function roleMigruj(nazev) {
  return ROLE_MIGRACE[nazev] || nazev;
}
function roleMigrujSeznam(pole) {
  const out = [];
  (Array.isArray(pole) ? pole : []).forEach(r => {
    const n = roleMigruj(r);
    if (!out.includes(n)) out.push(n);
  });
  return out;
}
function stropyMigruj(stropy) {
  const out = {};
  Object.keys(stropy || {}).forEach(k => {
    const n = roleMigruj(k);
    const v = +stropy[k] || 0;
    out[n] = Math.max(out[n] || 0, v);
  });
  return out;
}

if (typeof module !== 'undefined')
  module.exports = { slevaDefault, slevaVyhodnot, slevaPlati, slevaPodil,
                   ROLE_VYCHOZI, ROLE_MIGRACE, roleMigruj, roleMigrujSeznam, stropyMigruj };
