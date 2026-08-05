/* ============================================================
 * OBCHODNÍ ZAOKROUHLENÍ – UI (#38)
 *
 * Výpočet je v zaokrouhleni.js; tady je jen přepínač a to, co po jeho
 * zapnutí uvidí obchodník. Karta stojí hned pod slevou na kartě Kalkulace
 * OCK, protože je to poslední krok téhož: základní cena → sleva →
 * zaokrouhlení → cena, která jde ven.
 *
 * KAŽDÁ ČÁST NABÍDKY MÁ VLASTNÍ KARTU (zadání 4. 8. 2026):
 * „do kalkulace ock patří pouze část týkající se výtahové šachty, část
 * týkající se projekčních prací pak patří do sekce kalkulace proj."
 * Do 4. 8. 2026 tu byla jedna společná karta vykreslená dvakrát a obě
 * části se v ní nastavovaly najednou. Znamenalo to, že obchodník v Kalkulaci
 * PROJ omylem měnil i cenu šachty — a naopak. Rozdělení je zároveň v souladu
 * se vším ostatním, co je v aplikaci po částech: sleva OCK a PROJ, sazba DPH,
 * hlavičky obou nabídek. Stav: ZO = šachta, ZOP = projekční práce.
 *
 * Nic se neblokuje: i zaokrouhlení, které srazí marži pod minimum, se jen
 * spočítá a lišta marže (#36) se o tom zmíní. Zamčené varianty (#34) se
 * ale měnit nedají – zaokrSetKrok/zaokrSetSmer i jejich dvojčata pro PROJ
 * jsou v ZAMEK_CHRANENE, protože mění cenu, která už odešla zákazníkovi.
 * ============================================================ */

function zaokrSetKrok(val) { ZO.krok = Math.max(0, +val || 0); render(); }
function zaokrSetSmer(val) { ZO.smer = val; render(); }
function zaokrProjSetKrok(val) { ZOP.krok = Math.max(0, +val || 0); render(); }
function zaokrProjSetSmer(val) { ZOP.smer = val; render(); }

/* Dopad na tu část nabídky, o kterou jde. Spadne-li výpočet, řádek se prostě
 * neukáže – karta je informace o ceně, ne hlásič chyb výpočtu. */
function zaokrDopadOck() {
  try { return cenaNabidkyOck(vypocet(Z, C, JEKLY, OCK.fixes), SL, ZO); } catch (e) { return null; }
}
function zaokrDopadProj() {
  try { return cenaNabidkyProj(vypocetProj(PJ, PC), ZOP); } catch (e) { return null; }
}

/* Karta se vykresluje na dvou místech – pod výpočtem OCK a pod výpočtem PROJ.
 * Nejde ale o dvě vykreslení jedné karty: každá má vlastní stav, vlastní
 * přepínače i vlastní řádek s dopadem. Kotva se liší, aby na ni uměla skočit
 * klouzající lišta a aby si dvě kotvy stejného jména nepřebíraly odkaz. */
function zaokrKarta(kontext) {
  if (typeof zaokrDefault !== 'function') return '';
  const proj = kontext === 'proj';
  const st = proj ? ZOP : ZO;
  const krokOpts = ZAOKR_KROKY.map(k =>
    `<option value="${k.krok}" ${zaokrKrok(st) === k.krok ? 'selected' : ''}>${esc(k.popis)}</option>`).join('');
  const smerOpts = ZAOKR_SMERY.map(s =>
    `<option value="${s.smer}" ${zaokrSmer(st) === s.smer ? 'selected' : ''}>${esc(s.popis)}</option>`).join('');
  const zapnuto = zaokrZapnuto(st);

  const c = zapnuto ? (proj ? zaokrDopadProj() : zaokrDopadOck()) : null;
  const nazev = proj ? 'Projekční práce (PROJ) celkem' : 'Výtahová šachta (OCK) po slevě';
  const radek = () => {
    if (!c) return '';
    const zn = c.zaokrKc < 0 ? '#b91c1c' : (c.zaokrKc > 0 ? '#15803d' : '#5b6472');
    return `<tr><td>${esc(nazev)}</td>
      <td style="text-align:right">${fmt0(c.pred)}</td>
      <td style="text-align:right;color:${zn}">${esc(zaokrKc(c.zaokrKc))}</td>
      <td style="text-align:right;font-weight:700">${fmt0(c.cena)}</td></tr>`;
  };
  /* Věta pod tabulkou říká dvě věci: kde rozdíl uvidí zákazník a že tenhle
   * přepínač je opravdu jen o téhle části – druhá se nastavuje jinde. */
  const jinde = proj
    ? 'Zaokrouhlení ceny výtahové šachty se nastavuje v <b>Kalkulaci OCK</b>.'
    : 'Zaokrouhlení ceny projekčních prací se nastavuje v <b>Kalkulaci PROJ</b>.';
  const cojeste = proj
    ? 'Ceny jednotlivých činností PROJ se nezaokrouhlují, jen jejich součet.'
    : 'Ceny jednotlivých položek kalkulace zůstávají beze změny.';
  const dopad = c
    ? `<table class="sd-tbl" style="max-width:640px;margin-top:6px">
         <tr><th style="text-align:left">Část nabídky</th><th style="text-align:right">Spočtená cena</th>
             <th style="text-align:right">Zaokrouhlení</th><th style="text-align:right">Cena nabídky</th></tr>
         ${radek()}
       </table>
       <div class="note">Rozdíl je v nabídce i v krycím listu uveden vlastním řádkem – cena tak
         zůstane dohledatelná. ${cojeste} ${jinde}</div>`
    : `<div class="note">Zaokrouhluje se ${proj ? 'celková cena nabídky PROJ' : 'koncová cena nabídky OCK (po schválené slevě)'}.
         ${cojeste} Zaokrouhlením dolů se nikdy nenabídne nula. ${jinde}</div>`;

  const setKrok = proj ? 'zaokrProjSetKrok' : 'zaokrSetKrok';
  const setSmer = proj ? 'zaokrProjSetSmer' : 'zaokrSetSmer';
  const inner = `<div class="zak-head" style="grid-template-columns:1fr 1fr 1fr">
      <div class="row"><label>Zaokrouhlit koncovou cenu</label>
        <select onchange="${setKrok}(this.value)">${krokOpts}</select></div>
      <div class="row"><label>Směr</label>
        <select onchange="${setSmer}(this.value)" ${zapnuto ? '' : 'disabled'}>${smerOpts}</select></div>
      <div class="row"><label>Stav</label>
        <div><span class="pill ${zapnuto ? '' : 'mut'}">${zapnuto ? esc(zaokrStav(0, st).popis) : 'vypnuto'}</span></div></div>
    </div>
    ${dopad}`;
  return card(proj ? 'Obchodní zaokrouhlení koncové ceny PROJ (#38)'
                   : 'Obchodní zaokrouhlení koncové ceny OCK (#38)',
              inner, false, proj ? 'proj-zaokr' : 'ock-zaokr');
}
