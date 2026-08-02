/* ============================================================
 * INTERNÍ POZNÁMKY A PŘÍLOHY – obrazovka (#37)
 *
 * Karta na záložce Zakázka. Logika je celá v poznamky.js; tady je jen
 * zápisník na obrazovce a nahrávání souborů.
 *
 * Dvě věci, které se v UI dělají schválně jinak, než by se čekalo:
 *
 *   – Rozepsaný text nedrží <textarea>, ale proměnná POZN_ROZEPSANO.
 *     render() překresluje celou stránku (ukládání, hodiny, jiná karta),
 *     a kdyby text žil jen v DOM, po každém takovém překreslení by zmizel
 *     rozepsaný odstavec. Tohle je zápisník – ztratit v něm text je horší
 *     než pár řádků navíc v kódu.
 *
 *   – „Netiskne se" je napsané přímo v kartě, ne schované v nápovědě.
 *     Celá funkce stojí na tom, že si tím uživatel je jistý; kdyby si
 *     nebyl, psal by dál do e-mailů a zápisník by zůstal prázdný.
 * ============================================================ */

let POZN_ROZEPSANO = '';
let POZN_DRUH = 'obchod';
let POZN_UPRAVA = null;      // id právě upravované poznámky (null = nová)
let POZN_SMAZANE = false;    // zobrazit i smazané

function poznamkyZak() {
  return (typeof ZAK !== 'undefined' && ZAK) ? poznamkyZajisti(ZAK) : null;
}
function poznamkyKdo() {
  return (typeof NAST !== 'undefined' && NAST && NAST.uzivatel) ? NAST.uzivatel : '';
}
function poznamkyZmena() {
  if (typeof historieNeulozeno === 'function') historieNeulozeno();
  render();
}

/* ---------- zápis ---------- */

function poznamkyPis(val) { POZN_ROZEPSANO = val; }      // bez překreslení – neutíká kurzor
function poznamkyDruhSet(kod) { POZN_DRUH = kod; render(); }

function poznamkyUloz() {
  const zak = poznamkyZak(); if (!zak) return;
  const t = (POZN_ROZEPSANO || '').trim();
  if (!t) return;
  if (POZN_UPRAVA) {
    poznamkyUprav(zak, POZN_UPRAVA, t, { kdo: poznamkyKdo() });
    POZN_UPRAVA = null;
  } else {
    const v = (typeof aktivniVarianta === 'function') ? aktivniVarianta(zak) : null;
    poznamkyPridej(zak, t, { kdo: poznamkyKdo(), druh: POZN_DRUH, varianta: v ? v.id : null });
  }
  POZN_ROZEPSANO = '';
  poznamkyZmena();
}

function poznamkyUpravStart(id) {
  const zak = poznamkyZak(); if (!zak) return;
  const p = poznamkyNajdi(zak, id); if (!p) return;
  POZN_UPRAVA = id; POZN_ROZEPSANO = p.text; POZN_DRUH = p.druh;
  render();
  const ta = document.getElementById('poznText');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function poznamkyUpravZrus() { POZN_UPRAVA = null; POZN_ROZEPSANO = ''; render(); }

/* Mazání se neptá: poznámka nikam nezmizí, jen se schová, a hned vedle je
 * „Vrátit". Potvrzovací dialog by tu jen otravoval bez užitku. */
function poznamkySmazUI(id) {
  const zak = poznamkyZak(); if (!zak) return;
  if (POZN_UPRAVA === id) { POZN_UPRAVA = null; POZN_ROZEPSANO = ''; }
  poznamkySmaz(zak, id, { kdo: poznamkyKdo() });
  poznamkyZmena();
}
function poznamkyObnovUI(id) {
  const zak = poznamkyZak(); if (!zak) return;
  poznamkyObnov(zak, id);
  poznamkyZmena();
}
function poznamkySmazanePrepni() { POZN_SMAZANE = !POZN_SMAZANE; render(); }

/* ---------- přílohy ---------- */

function prilohyNahraj() {
  const zak = poznamkyZak(); if (!zak) return;
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.onchange = () => {
    const soubory = Array.from(inp.files || []);
    if (!soubory.length) return;
    let zbyva = soubory.length; const chyby = [];
    soubory.forEach(f => {
      const fr = new FileReader();
      fr.onload = () => {
        const r = prilohyPridej(zak, { nazev: f.name, typ: f.type, velikost: f.size, data: fr.result },
                                { kdo: poznamkyKdo() });
        if (!r.ok) chyby.push(f.name + ': ' + r.duvod);
        if (--zbyva === 0) { if (chyby.length) alert(chyby.join('\n')); poznamkyZmena(); }
      };
      fr.onerror = () => {
        chyby.push(f.name + ': soubor se nepodařilo načíst.');
        if (--zbyva === 0) { alert(chyby.join('\n')); poznamkyZmena(); }
      };
      fr.readAsDataURL(f);
    });
  };
  inp.click();
}

function prilohyStahni(id) {
  const zak = poznamkyZak(); if (!zak) return;
  const p = (zak.prilohy || []).find(x => x.id === id); if (!p) return;
  const a = document.createElement('a');
  a.href = p.data; a.download = p.nazev;
  document.body.appendChild(a); a.click(); a.remove();
}

function prilohySmazUI(id) {
  const zak = poznamkyZak(); if (!zak) return;
  const p = (zak.prilohy || []).find(x => x.id === id); if (!p) return;
  /* Tady se ptáme: na rozdíl od poznámky se obsah přílohy opravdu ztratí. */
  if (!confirm('Odebrat přílohu „' + p.nazev + '“? Obsah souboru se ze zakázky smaže natrvalo.')) return;
  prilohySmaz(zak, id, { kdo: poznamkyKdo() });
  poznamkyZmena();
}

/* ---------- vykreslení ---------- */

function poznamkyRadek(p) {
  const smazana = !!p.smazano;
  const kdo = p.kdo ? esc(p.kdo) : 'neuvedeno';
  const upr = p.upraveno
    ? ` <span class="pozn-upr">upraveno ${esc(poznamkyDatum(p.upraveno.kdy))}</span>` : '';
  const ovladani = smazana
    ? `<button class="mini" onclick="poznamkyObnovUI('${p.id}')">Vrátit</button>`
    : `<button class="mini" onclick="poznamkyUpravStart('${p.id}')">Upravit</button>
       <button class="mini" onclick="poznamkySmazUI('${p.id}')">Smazat</button>`;
  const stopa = smazana
    ? `<div class="pozn-stopa">Smazal ${esc(p.smazano.kdo || 'neuvedeno')} ${esc(poznamkyDatum(p.smazano.kdy))}
       – záznam zůstává v zakázce, dokud ho někdo nevrátí.</div>` : '';
  return `<li class="pozn-radek${smazana ? ' smazana' : ''}">
    <div class="pozn-hlava">
      <span class="pozn-druh d-${esc(p.druh)}">${esc(poznamkyDruhNazev(p.druh))}</span>
      <span class="pozn-kdy">${esc(poznamkyDatum(p.kdy))}, ${kdo}${upr}</span>
      <span class="pozn-ovl">${ovladani}</span>
    </div>
    <div class="pozn-text">${esc(p.text).replace(/\n/g, '<br>')}</div>
    ${stopa}</li>`;
}

function prilohyRadek(p) {
  return `<li class="pozn-priloha">
    <span class="nazev">${esc(p.nazev)}</span>
    <span class="vel">${esc(poznamkyVelikostText(p.velikost))}</span>
    <span class="kdy">${esc(poznamkyDatum(p.kdy))}${p.kdo ? ', ' + esc(p.kdo) : ''}</span>
    <span class="ovl">
      <button class="mini" onclick="prilohyStahni('${p.id}')">Stáhnout</button>
      <button class="mini" onclick="prilohySmazUI('${p.id}')">Odebrat</button>
    </span></li>`;
}

function poznamkyKarta() {
  const zak = poznamkyZak();
  if (!zak) return '';
  const seznam = poznamkySeznam(zak, { smazane: POZN_SMAZANE });
  const sh = poznamkyShrnuti(zak);
  const prilohy = prilohySeznam(zak);

  const druhy = POZN_DRUHY.map(d =>
    `<button class="mini${d.kod === POZN_DRUH ? ' primary' : ''}"
       onclick="poznamkyDruhSet('${d.kod}')">${esc(d.nazev)}</button>`).join(' ');

  const zapis = `<div class="pozn-zapis">
    <div class="btns" style="flex-wrap:wrap">${druhy}</div>
    <textarea id="poznText" rows="3" style="width:100%;margin-top:6px;text-align:left"
      placeholder="Např.: Sleva 6 % dohodnutá s p. Novákem – tři šachty v jedné budově, montáž v jednom nájezdu."
      oninput="poznamkyPis(this.value)">${esc(POZN_ROZEPSANO)}</textarea>
    <div class="btns" style="margin-top:6px">
      <button class="primary" onclick="poznamkyUloz()">${POZN_UPRAVA ? 'Uložit úpravu' : 'Přidat poznámku'}</button>
      ${POZN_UPRAVA ? '<button class="mini" onclick="poznamkyUpravZrus()">Zrušit úpravu</button>' : ''}
      <button onclick="prilohyNahraj()">Přidat přílohu</button>
      <span class="note">${sh.pocet} poznámek, ${prilohy.length} příloh
        (${esc(poznamkyVelikostText(sh.bajtu))})</span>
    </div></div>`;

  const listPozn = seznam.length
    ? `<ul class="pozn-seznam">${seznam.map(poznamkyRadek).join('')}</ul>`
    : `<div class="note" style="margin-top:8px">Zatím tu nic není. Sem patří to, co se jinak ztratí
       v e-mailu: proč se dala sleva, co jsme slíbili, na čem se čeká.</div>`;

  const prepinac = sh.smazanych
    ? `<div class="btns" style="margin-top:6px"><button class="mini" onclick="poznamkySmazanePrepni()">
       ${POZN_SMAZANE ? 'Skrýt smazané' : 'Zobrazit i smazané (' + sh.smazanych + ')'}</button></div>`
    : '';

  const listPril = prilohy.length
    ? `<div class="note" style="font-weight:600;margin-top:12px">Přílohy:</div>
       <ul class="pozn-prilohy">${prilohy.map(prilohyRadek).join('')}</ul>`
    : '';

  return zapis + listPozn + prepinac + listPril
    + `<div class="note" style="margin-top:10px"><b>Nic z této karty se netiskne</b> – poznámky ani
       přílohy se neobjeví v cenové nabídce, krycím listu ani v technické specifikaci. Cestují jen
       uvnitř souboru zakázky, takže je při předání zakázky kolegovi má rovnou k dispozici.
       Přílohy se ukládají přímo do souboru zakázky: nejvýš
       ${esc(poznamkyVelikostText(POZN_MAX_PRILOHA))} na soubor a
       ${esc(poznamkyVelikostText(POZN_MAX_CELKEM))} dohromady, aby zakázka zůstala odeslatelná
       e-mailem. Smazaná poznámka zůstává v datech se jménem a datem – zápisník se nemá dát tiše
       vygumovat.</div>`;
}
