/* ============================================================
 * HLÍDÁNÍ MARŽE – lišta (#36, UI)
 *
 * Výpočet je v marze.js; tady je jen to, kde a komu se věta ukáže.
 *
 * Tři místa, stejná věta:
 *   – Kalkulace OCK  … nad tabulkou, o marži OCK,
 *   – Kalkulace PROJ … nad sekcemi, o marži PROJ a jejích sekcích,
 *   – před tiskem    … o celé nabídce; to je poslední okamžik, kdy to ještě
 *                      někoho zajímá (stejný slot jako u stáří ceníku, #35).
 *
 * Kdo vidí čísla: platí stejné pravidlo jako u KPI a sloupců nákladů –
 * konkrétní marže a částky patří administrátorovi (nebo tomu, komu se KPI
 * „Marže" zviditelnila). Běžný uživatel vidí, že je cena pod firemním
 * minimem, ale ne o kolik a ne z jakých nákladů. Kdyby varování nevidělo
 * vůbec, hlídání ztrácí smysl – nabídku posílá právě on.
 *
 * Lišta nemá tlačítko na schování. Na rozdíl od stáří sestavení tohle není
 * poznámka k prostředí, ale k ceně, kterou se člověk chystá poslat ven;
 * zhasne, až se cena spraví, nebo když se marže vědomě povolí v Nastavení.
 * Nic se neblokuje.
 * ============================================================ */

function marzeSmiCisla() {
  if (typeof smiZobrazit === 'function' && smiZobrazit('marze.lista')) return true;
  return !!(typeof NAST !== 'undefined' && NAST.kpiViditelne && NAST.kpiViditelne.marze);
}

/* Přehled nad aktuálním stavem obou kalkulací. Spadne-li výpočet, bere se ta
 * část jako neznámá – hlídání marže není místo, kde hlásit chybu výpočtu. */
function marzePrehledAkt() {
  let ock = null, proj = null;
  try { ock = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  try { proj = vypocetProj(PJ, PC); } catch (e) {}
  /* ZO/ZOP (#38): hlídá se marže z ceny po obchodním zaokrouhlení, tedy z toho,
   * co zákazník opravdu zaplatí – zaokrouhlením dolů se marže reálně snižuje.
   * Od 4. 8. 2026 má každá část vlastní nastavení: ZO = výtahová šachta,
   * ZOP = projekční práce. Kdyby ZOP z jakéhokoli důvodu nebyl, spadne se na
   * ZO – tedy na chování před rozdělením. */
  /* Dvě slevy, každá ke své části (#134): SL k výtahové šachtě, SLP
   * k projekci. Prohodit je znamená hlídat marži proti cizí ceně. */
  return marzePrehled(ock, proj, typeof SL !== 'undefined' ? SL : null, NAST,
                      typeof ZO !== 'undefined' ? ZO : null,
                      (typeof ZOP !== 'undefined' && ZOP) ? ZOP
                        : (typeof ZO !== 'undefined' ? ZO : null),
                      typeof SLP !== 'undefined' ? SLP : null);
}

/* cast: 'ock' | 'proj' | '' (celá nabídka) */
function marzePrehledCasti(cast) {
  const p = marzePrehledAkt();
  if (cast === 'ock') {
    const pod = (p.ock && p.ock.podMin) ? [p.ock] : [];
    return { varovat: pod.length > 0, min: p.min, pod, celek: p.ock };
  }
  if (cast === 'proj') {
    const celek = p.proj ? p.proj.celek : null;
    const pod = p.proj ? p.proj.pod.slice() : [];
    if (celek && celek.podMin && !pod.length) pod.push(celek);
    return { varovat: pod.length > 0, min: p.min, pod, celek };
  }
  return p;
}

const MARZE_POPISKY = { ock: 'kalkulace OCK', proj: 'kalkulace PROJ', '': 'celé nabídky' };

/* opts.cast – část nabídky; opts.bezCisel – vynutí stručnou podobu (náhled
 * tisku běží ve vlastním okně a odchází ven, čísla nákladů tam nepatří). */
function marzeLista(opts) {
  opts = opts || {};
  if (typeof marzePrehled !== 'function') return '';
  const cast = opts.cast || '';
  const p = marzePrehledCasti(cast);
  const veta = marzeText(p, { cisla: marzeSmiCisla() && !opts.bezCisel, co: MARZE_POPISKY[cast] });
  if (!veta) return '';
  const stupen = p.pod.reduce((a, s) => (s.stupen === 'ztrata' ? 'ztrata' : a), 'pod');
  return `<div class="marze-lista ${stupen === 'ztrata' ? 'ztrata' : ''}">
    <span class="ikona">${stupen === 'ztrata' ? '🛑' : '⚠'}</span>
    <span>${esc(veta)}</span>
  </div>`;
}
