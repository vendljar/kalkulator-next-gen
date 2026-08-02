/* ============================================================
 * OBCHODNÍ ZAOKROUHLENÍ – UI (#38)
 *
 * Výpočet je v zaokrouhleni.js; tady je jen přepínač a to, co po jeho
 * zapnutí uvidí obchodník. Karta stojí hned pod slevou na kartě Kalkulace
 * OCK, protože je to poslední krok téhož: základní cena → sleva →
 * zaokrouhlení → cena, která jde ven.
 *
 * Nastavení platí pro CELOU VARIANTU, tedy i pro nabídku PROJ. Kdyby si
 * každá část držela vlastní krok, vznikly by dvě různé politiky nad jednou
 * zakázkou a nikdo by nevěděl, která platí. Karta to proto říká nahlas
 * a ukazuje dopad na obě části najednou.
 *
 * Nic se neblokuje: i zaokrouhlení, které srazí marži pod minimum, se jen
 * spočítá a lišta marže (#36) se o tom zmíní. Zamčené varianty (#34) se
 * ale měnit nedají – zaokrSetKrok/zaokrSetSmer jsou v ZAMEK_CHRANENE,
 * protože mění cenu, která už odešla zákazníkovi.
 * ============================================================ */

function zaokrSetKrok(val) { ZO.krok = Math.max(0, +val || 0); render(); }
function zaokrSetSmer(val) { ZO.smer = val; render(); }

/* Dopad na obě části nabídky. Spadne-li výpočet, ta část se prostě neukáže –
 * karta je informace o ceně, ne hlásič chyb výpočtu. */
function zaokrDopad() {
  let ock = null, proj = null;
  try { ock = cenaNabidkyOck(vypocet(Z, C, JEKLY, OCK.fixes), SL, ZO); } catch (e) {}
  try { proj = cenaNabidkyProj(vypocetProj(PJ, PC), ZO); } catch (e) {}
  return { ock, proj };
}

/* Karta se vykresluje na dvou místech – pod výpočtem OCK a pod výpočtem PROJ
 * (zadání 1. 8. 2026). Je to pořád JEDNA karta nad jedním stavem ZO; liší se
 * jen kotva, aby na ni uměla skočit klouzající lišta a aby si dvě kotvy
 * stejného jména nepřebíraly odkaz. */
function zaokrKarta(kontext) {
  if (typeof zaokrDefault !== 'function') return '';
  const proj = kontext === 'proj';
  const krokOpts = ZAOKR_KROKY.map(k =>
    `<option value="${k.krok}" ${zaokrKrok(ZO) === k.krok ? 'selected' : ''}>${esc(k.popis)}</option>`).join('');
  const smerOpts = ZAOKR_SMERY.map(s =>
    `<option value="${s.smer}" ${zaokrSmer(ZO) === s.smer ? 'selected' : ''}>${esc(s.popis)}</option>`).join('');
  const zapnuto = zaokrZapnuto(ZO);

  const d = zapnuto ? zaokrDopad() : { ock: null, proj: null };
  const radek = (nazev, c) => {
    if (!c) return '';
    const zn = c.zaokrKc < 0 ? '#b91c1c' : (c.zaokrKc > 0 ? '#15803d' : '#5b6472');
    return `<tr><td>${esc(nazev)}</td>
      <td style="text-align:right">${fmt0(c.pred)}</td>
      <td style="text-align:right;color:${zn}">${esc(zaokrKc(c.zaokrKc))}</td>
      <td style="text-align:right;font-weight:700">${fmt0(c.cena)}</td></tr>`;
  };
  const dopad = zapnuto && (d.ock || d.proj)
    ? `<table class="sd-tbl" style="max-width:640px;margin-top:6px">
         <tr><th style="text-align:left">Část nabídky</th><th style="text-align:right">Spočtená cena</th>
             <th style="text-align:right">Zaokrouhlení</th><th style="text-align:right">Cena nabídky</th></tr>
         ${radek('Výtahová šachta (OCK) po slevě', d.ock)}
         ${radek('Projekční práce (PROJ) celkem', d.proj)}
       </table>
       <div class="note">Rozdíl je v nabídce i v krycím listu uveden vlastním řádkem – cena tak
         zůstane dohledatelná. Ceny jednotlivých činností PROJ se nezaokrouhlují, jen jejich součet.</div>`
    : `<div class="note">Zaokrouhluje se koncová cena nabídky OCK (po schválené slevě) a celková
         cena nabídky PROJ. Ceny položek a činností zůstávají beze změny.
         Zaokrouhlením dolů se nikdy nenabídne nula.</div>`;

  const inner = `<div class="zak-head" style="grid-template-columns:1fr 1fr 1fr">
      <div class="row"><label>Zaokrouhlit koncovou cenu</label>
        <select onchange="zaokrSetKrok(this.value)">${krokOpts}</select></div>
      <div class="row"><label>Směr</label>
        <select onchange="zaokrSetSmer(this.value)" ${zapnuto ? '' : 'disabled'}>${smerOpts}</select></div>
      <div class="row"><label>Stav</label>
        <div><span class="pill ${zapnuto ? '' : 'mut'}">${zapnuto ? esc(zaokrStav(0, ZO).popis) : 'vypnuto'}</span></div></div>
    </div>
    ${dopad}`;
  return card('Obchodní zaokrouhlení koncové ceny (#38)', inner, false, proj ? 'proj-zaokr' : 'ock-zaokr');
}
