/* ================= ZÁMEK VYTIŠTĚNÉ NABÍDKY – UI (#34) =================
 *
 * Model je v zamek.js; tady je jen obsluha: zablokování editace, lišta se
 * stavem, klonování a odemčení správcem.
 *
 * PROČ SEZNAM FUNKCÍ A NE ZAMRAŽENÍ STRÁNKY:
 * nabídku lze tisknout jen ze stránek, na kterých se zároveň edituje
 * (Kalkulace OCK, Přehled cenových nabídek). Kdyby se zamčená varianta
 * „zmrazila" přes CSS (pointer-events:none), vypnula by se s ní i tlačítka
 * tisku, tedy to jediné, co má na zamčené variantě zůstat funkční.
 * Blokujeme proto adresně jednotlivé zapisující funkce.
 *
 * Sestavená aplikace je jeden <script>, takže deklarované funkce jsou
 * zapisovatelné vlastnosti window – obalení je pak jednořádkové a platí
 * i pro volání z atributů onclick v HTML.
 *
 * SEBEKONTROLA: přejmenovaná nebo nová zapisující funkce, která tu chybí,
 * by zámek tiše obešla. Proto overit_lista.mjs kontroluje, že každý název
 * ze ZAMEK_CHRANENE v běžící aplikaci existuje a je obalený (příznak
 * _zamek). Když někdo funkci přejmenuje, spadne test – ne zámek. */

const ZAMEK_CHRANENE = [
  // Kalkulace OCK – množství, ceny, vlastní položky, příplatky, pořadí
  'mnozstviSet', 'nazevSet', 'nazevReset', 'cenaSet',
  'vlastniAdd', 'vlastniDel', 'vlastniSet', 'vlastniDoCeniku',
  'volitelneToggle', 'viditelnostSet', 'volitelneVychoziSet', 'presunRadek',
  'priplatekNabidka', 'priplatekVlastniAdd', 'priplatekVlastniDel',
  'priplatekVlastniSet', 'priplatekDoCeniku',
  'sirotciUklidVse', 'sirotekUklid',
  // Ceníky varianty (katalog, reset, import z Excelu)
  'katAdd', 'katSet', 'katDel', 'resetCenik', 'resetCenikProj', 'cenikImportPotvrd',
  // Technická specifikace + její data
  'tsSet', 'tsReset', 'tsSelect', 'tsExtraAdd', 'tsExtraDel', 'tsExtraSet',
  'sdItemSet', 'sdItemAdd', 'sdItemDel', 'sdItemMove', 'sdDefSet', 'sdDefVlastni', 'sdResetVse',
  // Krycí listy
  'klSet', 'klReset', 'klpSet', 'klpReset',
  // Kalkulace PROJ a text nabídky PROJ
  'pjSet', 'pjPolozkaAdd', 'pjPolozkaDel', 'nabidkaProjPopis',
  // Sleva (mění cenu, která už odešla zákazníkovi)
  // `slevaSetSchvalitel` a `slevaSchval` zanikly 5. 8. 2026 se stěhováním
  // schvalování do vlastní záložky. Rozhodování (schvRozhodni) se sem NEPŘIDÁVÁ:
  // zamekStop() se ptá na PRÁVĚ OTEVŘENOU variantu, kdežto v seznamu se
  // rozhoduje o libovolné – zámek si proto hlídá schvRozhodni samo na cílové
  // variantě, jinak by uzamčená otevřená varianta blokovala schválení všech
  // ostatních.
  // Od 12. 8. 2026 (#134) jsou slevy dvě – na výtahovou šachtu a na projekci.
  // Chráněné musí být obě, jinak by zamčenou variantu šlo přecenit tou druhou.
  // Pole „Globální sleva PROJ" (pjSlevaGlobal) tou změnou zaniklo.
  'slevaSet', 'slevaZrus', 'slevaProjSet', 'slevaProjZrus',
  // Obchodní zaokrouhlení (#38) – také mění koncovou cenu nabídky
  // Od 4. 8. 2026 je karta rozdělená na část OCK a část PROJ – chráněné
  // musí být obě, jinak by zamčenou variantu šlo přecenit přes Kalkulaci PROJ.
  'zaokrSetKrok', 'zaokrSetSmer', 'zaokrProjSetKrok', 'zaokrProjSetSmer',
];

let _zamekNainstalovan = false;

function zamekChranFunkce() {
  if (_zamekNainstalovan || typeof window === 'undefined') return;
  _zamekNainstalovan = true;
  ZAMEK_CHRANENE.forEach(nazev => {
    const puvodni = window[nazev];
    if (typeof puvodni !== 'function') {
      console.warn('Zámek: funkce ' + nazev + ' neexistuje – zkontrolujte ZAMEK_CHRANENE.');
      return;
    }
    if (puvodni._zamek) return;
    const obal = function (...args) {
      if (zamekStop()) return;
      return puvodni.apply(this, args);
    };
    obal._zamek = true;
    obal._puvodni = puvodni;
    window[nazev] = obal;
  });
}

/* Vrací true, když je zápis zakázaný (a uživateli to vysvětlí). */
function zamekStop() {
  const v = aktivniVarianta(ZAK);
  if (variantaEditovatelna(v)) return false;
  zamekUpozorni(v);
  return true;
}

function zamekUpozorni(v) {
  const z = zamekInfo(v);
  const kdy = ((z && z.kdy) || '').slice(0, 10);
  const cislo = variantaCislo(ZAK, v);
  const chce = confirm(
    `Varianta „${v.nazev}" (${cislo}) je uzamčená.\n\n`
    + `Byla ${kdy ? kdy + ' ' : ''}vytištěna jako ${(z && z.popis) || 'cenová nabídka'}, `
    + `a vytištěná nabídka se považuje za odeslanou zákazníkovi – proto se už needituje.\n\n`
    + `OK = založit klon varianty (${variantaCisloDalsi()}) a pokračovat v něm\n`
    + `Zrušit = nechat vše beze změny`);
  if (chce) zamekKlonUI(v.id);
  else render();   // vrátí do polí hodnoty ze zakázky (uživatel je mohl přepsat)
}

/* Náhled čísla, které dostane příští klon – jen pro text hlášky. */
function variantaCisloDalsi() {
  const p = dalsiPriponaVarianty(ZAK);
  return String(ZAK.cislo || '').replace(/\s+$/, '') + '.' + p;
}

/* ---------- klonování ---------- */

function zamekKlonUI(id) {
  const zdroj = ZAK.varianty.find(x => x.id === id) || aktivniVarianta(ZAK);
  if (!zdroj) return;
  const klon = klonujVariantu(ZAK, zdroj.id);
  if (!klon) return;
  syncVarianta();
  render();
  nabidkaStavTextBezpecne(`Založena nová varianta ${variantaCislo(ZAK, klon)} („${klon.nazev}") `
    + `jako kopie ${variantaCislo(ZAK, zdroj)}. Pokračujte v ní.`);
}

/* Stavový řádek nabídky nemusí být na stránce (jiná záložka) – nevadí. */
function nabidkaStavTextBezpecne(txt) {
  if (typeof nabidkaStavText === 'function') nabidkaStavText(txt);
}

/* ---------- odemčení (jen správce, vždy s důvodem) ---------- */

function zamekOdemkniUI(id) {
  const v = ZAK.varianty.find(x => x.id === id);
  if (!v || !variantaUzamcena(v)) return;
  if (!smiZobrazit('zamek.odemknout')) {
    alert('Odemknout odeslanou nabídku může jen správce.\n\n'
      + 'Běžný postup je založit klon varianty a pokračovat v něm – '
      + 'původní nabídka tak zůstane přesně v podobě, v jaké odešla zákazníkovi.');
    return;
  }
  const duvod = prompt('Odemknutí odeslané nabídky ' + variantaCislo(ZAK, v)
    + '.\n\nUveďte důvod (uloží se do zakázky):', '');
  if (duvod === null) return;
  const r = odemkniVariantu(v, { jeAdmin: true, duvod, kdo: zamekKdo() });
  if (!r.ok) { alert('Odemknutí neproběhlo: ' + r.duvod); return; }
  render();
}

function zamekKdo() {
  return (typeof NAST !== 'undefined' && NAST.uzivatel) ? String(NAST.uzivatel) : '';
}

/* ---------- uzamčení tiskem ---------- */

/* Volá se ze dvou míst: po stažení nabídky do Wordu a z tiskového náhledu
 * (okno náhledu si sáhne přes window.opener). Zamykají jen dokumenty, které
 * jdou zákazníkovi – viz ZAMEK_DOKUMENTY v zamek.js. */
function zamekPoTisku(typ, varId, sablona) {
  if (!dokumentZamyka(typ)) return null;
  const v = (varId && ZAK.varianty.find(x => x.id === varId)) || aktivniVarianta(ZAK);
  if (!v) return null;
  const prvni = !variantaUzamcena(v);
  let otisk = null;
  if (prvni) {
    try { otisk = zamekOtiskZPorovnani(porovnaniData(), v.id); } catch (e) { otisk = null; }
  }
  zamkniVariantu(v, { typ, kdo: zamekKdo(), cislo: variantaCislo(ZAK, v), otisk,
                      sablona: sablona || null });
  render();
  return v.zamek;
}

/* ---------- lišta se stavem zámku ---------- */

function zamekLista() {
  const v = aktivniVarianta(ZAK);
  const z = zamekInfo(v);
  if (!z) return '';
  const kdy = (z.kdy || '').slice(0, 10);
  const pocet = Array.isArray(z.tisky) ? z.tisky.length : 1;
  return `<div class="zamek-lista">
    <span class="ikona">🔒</span>
    <span><b>${esc(v.nazev)} (${esc(z.cislo || variantaCislo(ZAK, v))}) je odeslaná nabídka – needituje se.</b>
      Vytištěno ${esc(kdy)} jako ${esc(z.popis || 'cenová nabídka')}${pocet > 1 ? ` (výtisků: ${pocet})` : ''}.
      Pokračujte klonem; původní nabídka zůstane v podobě, v jaké odešla.</span>
    <span class="sp"></span>
    <button class="primary" onclick="zamekKlonUI('${escJs(v.id)}')">Klonovat a pokračovat</button>
    ${smiZobrazit('zamek.odemknout') ? `<button class="mini" onclick="zamekOdemkniUI('${escJs(v.id)}')">Odemknout…</button>` : ''}
  </div>`;
}

function renderZamekLista() {
  const el = document.getElementById('zamekLista');
  if (el) el.innerHTML = zamekLista();
}

/* Stav varianty do přehledové tabulky (sloupec „Stav"). */
function zamekStavText(v) {
  const z = zamekInfo(v);
  if (z) return `<span class="zamek-stav zamceno" title="${esc((z.popis || '') + ' · ' + (z.kdy || '').slice(0, 10))}">🔒 odeslána</span>`;
  if (Array.isArray(v.odemceni) && v.odemceni.length)
    return `<span class="zamek-stav odemceno" title="odemkl správce – viz historie v souboru zakázky">🔓 odemčena</span>`;
  return `<span class="zamek-stav">rozpracovaná</span>`;
}
