/* ============================================================
 * DIALOGY V APLIKACI — náhrada confirm() / alert() / prompt()
 * (2. 9. 2026, zadání J. V.)
 *
 * PROČ: nativní dialog prohlížeče zastaví celý renderer. Rozšíření, které
 * aplikaci ovládá zvenčí (a tedy i automatizované testování celé cesty
 * obchodníka), přestane dostávat příkazy — při testu 2. 9. zamrzlo
 * „✚ Nová zakázka" i přepínač ceníku ČR/Zahraničí a nešlo pokračovat jinak
 * než naslepo Enterem a reloadem. Řešení musí být v DOM, ne v konzoli.
 *
 * CO TO DĚLÁ: jeden modál nad stránkou, tři funkce vracející Promise:
 *   potvrd(text, opts) → Promise<boolean>        (náhrada confirm)
 *   hlaska(text, opts) → Promise<void>           (náhrada alert)
 *   dotaz(text, vychozi) → Promise<string|null>  (náhrada prompt)
 *
 * PRAVIDLA, KTERÁ SE DODRŽUJÍ:
 *   – tlačítka nesou `data-dlg="ano" | "ne" | "text"` a modál `id="dlg"`,
 *     aby se dal spolehlivě naklikat i po překreslení stránky;
 *   – text se escapuje (do dialogu tečou i názvy položek od uživatele —
 *     nález B26) a zachovává řádkování (`white-space: pre-line`);
 *   – Esc = zrušit, Enter = potvrdit, focus po otevření na výchozím tlačítku;
 *   – dialogy se ŘADÍ ZA SEBE, nepřekrývají se: druhé volání čeká, až se
 *     první vyřídí (jinak by se ztratila odpověď na ten pod ním);
 *   – modál se netiskne (`noprint`).
 *
 * Kdo přidá nový `confirm(`/`alert(`/`prompt(` do src/, shodí sadu
 * `src/test_dialogy.js` — je to schválně, ať se nativní dialogy nevrátí
 * zadními vrátky.
 * ============================================================ */

const DLG = { fronta: [], bezi: false };

function dlgEsc(t) {
  return (typeof esc === 'function') ? esc(t == null ? '' : t) : String(t == null ? '' : t);
}

/* Vykreslí modál a vrátí Promise s odpovědí. Typ: 'potvrd' | 'hlaska' | 'dotaz'. */
function dlgUkaz(typ, text, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const stary = document.getElementById('dlg');
    if (stary) stary.remove();

    const ano = dlgEsc(opts.ano || (typ === 'hlaska' ? 'OK' : 'Ano'));
    const ne = dlgEsc(opts.ne || 'Ne');
    const nadpis = opts.nadpis ? `<div class="dlg-nadpis">${dlgEsc(opts.nadpis)}</div>` : '';
    const poleHtml = typ === 'dotaz'
      ? `<input type="text" id="dlg-text" data-dlg="text" value="${dlgEsc(opts.vychozi || '')}">`
      : '';
    const tlacitka = typ === 'hlaska'
      ? `<button class="primary" data-dlg="ano">${ano}</button>`
      : `<button data-dlg="ne">${ne}</button><button class="primary" data-dlg="ano">${ano}</button>`;

    const el = document.createElement('div');
    el.id = 'dlg';
    el.className = 'dlg-overlay noprint';
    el.innerHTML = `<div class="dlg-box" role="dialog" aria-modal="true">
        ${nadpis}
        <div class="dlg-text">${dlgEsc(text)}</div>
        ${poleHtml}
        <div class="dlg-btns">${tlacitka}</div>
      </div>`;
    document.body.appendChild(el);

    const pole = el.querySelector('[data-dlg="text"]');
    const zavri = (vysledek) => {
      document.removeEventListener('keydown', naKlavesu, true);
      el.remove();
      resolve(vysledek);
    };
    const potvrdit = () => zavri(typ === 'dotaz' ? (pole ? pole.value : '') : (typ === 'hlaska' ? undefined : true));
    const zrusit = () => zavri(typ === 'dotaz' ? null : (typ === 'hlaska' ? undefined : false));

    function naKlavesu(e) {
      if (e.key === 'Escape') { e.preventDefault(); zrusit(); }
      else if (e.key === 'Enter' && (!pole || document.activeElement === pole)) { e.preventDefault(); potvrdit(); }
    }
    document.addEventListener('keydown', naKlavesu, true);
    el.querySelector('[data-dlg="ano"]').addEventListener('click', potvrdit);
    const btnNe = el.querySelector('[data-dlg="ne"]');
    if (btnNe) btnNe.addEventListener('click', zrusit);
    /* Klik mimo box = zrušit; u hlášky zavřít. Nechává to cestu ven i tehdy,
     * když se tlačítko schová pod jiným prvkem. */
    el.addEventListener('mousedown', (e) => { if (e.target === el) zrusit(); });

    setTimeout(() => {
      if (pole) { pole.focus(); pole.select(); }
      else {
        const cil = el.querySelector('[data-dlg="' + (opts.vychoziNe ? 'ne' : 'ano') + '"]');
        if (cil) cil.focus();
      }
    }, 0);
  });
}

/* Řazení: druhý dialog počká, až se první vyřídí. */
function dlgZarad(typ, text, opts) {
  const beh = () => dlgUkaz(typ, text, opts).then(v => {
    DLG.bezi = false;
    const dalsi = DLG.fronta.shift();
    if (dalsi) { DLG.bezi = true; dalsi(); }
    return v;
  });
  if (!DLG.bezi) { DLG.bezi = true; return beh(); }
  return new Promise(resolve => {
    DLG.fronta.push(() => beh().then(resolve));
  });
}

function potvrd(text, opts) { return dlgZarad('potvrd', text, opts); }
function hlaska(text, opts) { return dlgZarad('hlaska', text, opts); }
function dotaz(text, vychozi) { return dlgZarad('dotaz', text, { vychozi: vychozi }); }

if (typeof module !== 'undefined') module.exports = { potvrd, hlaska, dotaz };
