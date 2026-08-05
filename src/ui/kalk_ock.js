/* ================= ZÁLOŽKA KALKULACE OCK ================= */

function renderInputs() {
  const dims = Object.keys(JEKLY);
  const profRow = (key, label) => {
    const p = Z.profily[key];
    const tls = Object.keys(JEKLY[p.dim].kg);
    return `<div class="row"><label>${label}</label>
      <select style="width:86px" onchange="set('Z.profily.${key}.dim', this.value); zkontrolujTl('${key}')">${dims.map(d =>
        `<option ${d === p.dim ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <select style="width:64px" onchange="set('Z.profily.${key}.tl', +this.value)">${tls.map(t =>
        `<option ${+t === p.tl ? 'selected' : ''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>`;
  };
  document.getElementById('inputs').innerHTML =
    card('Zadání šachty',
      inp('Z.prejezd', { l: 'Horní přejezd', u: 'm' }) + inp('Z.zdvih', { l: 'Zdvih', u: 'm' }) +
      inp('Z.prohluben', { l: 'Prohlubeň (spodní přejezd)', u: 'm' }) +
      inp('Z.sirka', { l: 'Vnitřní šířka', u: 'm' }) + inp('Z.hloubka', { l: 'Vnitřní hloubka', u: 'm' }) +
      inp('Z.roztec', { l: 'Svislá rozteč příčníků', u: 'm' }) +
      inp('Z.rohoveSloupky', { l: 'Počet rohových sloupků', step: 1 }) + inp('Z.nastupiste', { l: 'Počet nástupišť', step: 1 }) +
      inp('Z.typSachty', { type: 'sel', l: 'Typ šachty', o: [['exteriérová', 'exteriérová'], ['interiérová', 'interiérová']] }) +
      inp('Z.typPortalu', { type: 'sel', l: 'Typ portálů', o: [['zapuštěný', 'zapuštěný'], ['předsazený', 'předsazený']] }) +
      inp('Z.zaskleni', { type: 'sel', l: 'Způsob zasklení', o: [['na terče', 'na terče'], ['mezi příčníky', 'mezi příčníky (lišty)']] }) +
      inp('Z.svetlikNadDvermi', { type: 'check', l: 'Světlík nad šachetními dveřmi' }) +
      inp('Z.svetlikyBoky', { type: 'sel', l: 'Světlíky na bocích dveří', o: [[0, 'bez'], [1, 'na jedné straně'], [2, 'na obou stranách']] }) +
      inp('Z.cistyVstupMm', { l: 'Čistý vstup – šířka', step: 10, u: 'mm' }) + inp('Z.sirkaRamuMm', { l: 'Šířka rámu dveří', step: 5, u: 'mm' }) +
      inp('Z.prechodovePlechy', { type: 'check', l: 'Přechodové plechy' }) +
      inp('Z.pruchoziSachta', { type: 'check', l: 'Průchozí šachta (stříška na dvůr)' }) +
      inp('Z.atyp', { type: 'check', l: 'ATYP (nestandardní zakázka)' }) +
      // ATYP není jen štítek – od #22 přidává přirážku do Režie. Sazbu ukazujeme
      // rovnou tady, aby obchodník viděl dopad zaškrtnutí ještě před přepočtem.
      `<div class="note" style="margin-top:2px">Přidá do sekce <b>Režie</b> přirážku
        <b>${typeof atypSazbaProc === 'function' ? atypSazbaProc() : 30} %</b> z nákladu
        <b>celé sekce Režie</b> za projekční a koordinační práce. Sazba patří k této
        zakázce (je v jejím ceníku) a mění ji administrátor v <b>Nastavení → Obecné</b>;
        starší nabídky se změnou nepřepočítají.</div>`, false, 'ock-zadani') +
    card('Dimenze profilů',
      profRow('sloupek', 'Sloupek') + profRow('precnikBok', 'Příčníky bok/zadek') + profRow('sloupekPortal', 'Sloupek portálu') +
      profRow('precnikPortal', 'Příčníky portálu') + profRow('spojka', 'Spojka sloupků') + profRow('lemovani', 'Lemování ext. šachty') +
      inp('Z.rezervaProfilyPct', { l: 'Rezerva profily (atyp)', step: 0.01, u: '%×' }) +
      inp('Z.rezervaPlechyPct', { l: 'Rezerva plechy (atyp)', step: 0.01, u: '%×' }), false, 'ock-profily') +
    card('Práce a režie',
      inp('Z.montazZakladHod', { l: 'Montáž – základ (1 os.)', step: 1, u: 'hod' }) +
      inp('Z.montazAtypHod', { l: 'Montáž – atyp navíc', step: 1, u: 'hod' }) +
      inp('Z.projekceZakladHod', { l: 'Projekce – základ', step: 1, u: 'hod' }) +
      inp('Z.projekceAtypHod', { l: 'Projekce – atyp navíc', step: 1, u: 'hod' }) +
      inp('Z.oplechOstatniKg', { l: 'Oplechování ostatní – materiál', step: 1, u: 'kg' }) +
      inp('Z.oplechOstatniHod', { l: 'Oplechování ostatní – práce', step: 1, u: 'hod' }) +
      inp('Z.zamecnikAtypKs', { l: 'Zámečník atyp – množství', step: 1 }) +
      /* Prázdné pole = platí ceníková sazba; vyplněné číslo je dohoda pro tuhle
       * jednu stavbu (i nula – „uděláme zdarma"). Proto v popisku „přepis", ne
       * „cena": cena bydlí v ceníku, tady se jen dá přebít (#7). */
      inp('Z.zamecnikAtypKc', { l: 'Zámečník atyp – přepis ceny (prázdné = ceník)', step: 100, u: 'Kč' }) +
      inp('Z.engineeringKs', { l: 'Engineering (0/1)', step: 1 }) +
      inp('Z.vystupZamereni', { type: 'check', l: 'Výstup ze zaměření pro zákazníka' }) +
      inp('Z.rezervaZakladPct', { l: 'REZERVA základ', step: 0.01, u: '×' }) +
      inp('Z.rezervaPriplatkyPct', { l: 'REZERVA příplatky', step: 0.01, u: '×' }), false, 'ock-prace');
}

/* ---- klíč položky (původní název) do onchange handleru bezpečně ----
 * Dřív se apostrof nahrazoval entitou &#39;. To ale nepomůže: prohlížeč
 * entitu rozkóduje ještě před tím, než obsah atributu předá JavaScriptu,
 * takže apostrof v názvu položky rozbil řetězec v handleru. escJs()
 * escapuje nejdřív pro JavaScript a teprve potom pro HTML (viz common.js). */
function keyAttr(s) { return escJs(s); }

/* ---- ruční přepis množství (klíčem je PŮVODNÍ název položky) ---- */
function mnozstviSet(nazev, v) {
  if (!Z.mnozstviPrepis) Z.mnozstviPrepis = {};
  if (v === '' || v == null) delete Z.mnozstviPrepis[nazev]; else Z.mnozstviPrepis[nazev] = +v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* ---- přejmenování položky ---- */
function nazevSet(orig, v) {
  if (!Z.nazvyPrepis) Z.nazvyPrepis = {};
  const nv = (v || '').trim();
  if (!nv || nv === orig) delete Z.nazvyPrepis[orig]; else Z.nazvyPrepis[orig] = nv;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function nazevReset(orig) { if (Z.nazvyPrepis) delete Z.nazvyPrepis[orig]; render(); }
/* ---- ruční přepis jedn. ceny u položek bez ceníkové vazby ---- */
function cenaSet(orig, v) {
  if (!Z.cenyPrepis) Z.cenyPrepis = {};
  if (v === '' || v == null) delete Z.cenyPrepis[orig]; else Z.cenyPrepis[orig] = +v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

/* ---- vlastní ruční položky v jednotlivých sekcích ---- */
function vlastniPolozkyArr(sekce) {
  if (!Z.vlastniPolozky) Z.vlastniPolozky = { hrubaOck: [], atyp: [], oplasteni: [], volitelne: [], rezie: [], spojovaci: [], lakovani: [] };
  if (!Array.isArray(Z.vlastniPolozky[sekce])) Z.vlastniPolozky[sekce] = [];
  // migrace starší sekce Volitelné (volitelneVlastni) do nové struktury
  if (sekce === 'volitelne' && Array.isArray(Z.volitelneVlastni) && Z.volitelneVlastni.length && !Z.vlastniPolozky.volitelne.length) {
    Z.vlastniPolozky.volitelne = Z.volitelneVlastni; Z.volitelneVlastni = [];
  }
  return Z.vlastniPolozky[sekce];
}
function vlastniAdd(sekce) { vlastniPolozkyArr(sekce).push({ nazev: 'Nová položka', mnozstvi: 1, cena: 0 }); aktivniVarianta(ZAK).upraveno = new Date().toISOString(); render(); }
function vlastniDel(sekce, i) {
  const p = vlastniPolozkyArr(sekce)[i];
  // katalogovou (trvalou) položku si zapamatuj jako odebranou, ať se v této zakázce nevrátí
  if (p && p.kid) {
    if (!confirm('Položka „' + p.nazev + '" je trvalá (z ceníku).\n\nSmazat ji jen v této zakázce?\nV ceníku a v nových nabídkách zůstane.')) return;
    katalogZapamatujOdebrani(Z, p);
  }
  vlastniPolozkyArr(sekce).splice(i, 1);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* lokální položku uložit natrvalo do ceníku (katalogu) → bude ve všech nových nabídkách */
function vlastniDoCeniku(sekce, i) {
  katalogUloz(KATALOG, Z, sekce, i);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function vlastniSet(sekce, i, k, v) {
  const p = vlastniPolozkyArr(sekce)[i];
  if (!p) return;
  const puvodni = p.nazev;
  p[k] = k === 'nazev' ? v : +v;
  // přejmenování vlastní položky – přestěhuj ruční přepisy klíčované názvem (#4)
  if (k === 'nazev' && puvodni && puvodni !== p.nazev) prepisyPrejmenuj(Z, puvodni, p.nazev);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

/* ---- zaškrtnutí volitelné položky do základní ceny ---- */
function volitelneToggle(key, v) {
  if (key === 'prechodove') { set('Z.prechodovePlechy', v); return; }   // jednotný zdroj pravdy
  set('Z.volitelne.' + key, v);
}

/* ---- buňky editovatelných sloupců (sdílené pro všechny sekce) ---- */
function bunkaNazev(r, sekceKey) {
  const orig = keyAttr(r.origNazev);
  const del = r.vlastni ? ` <button class="mini noprint" title="smazat položku" onclick="vlastniDel('${sekceKey}', ${r.idx})">✕</button>` : '';
  const pin = (r.vlastni && !r.kid && jeAdmin())
    ? ` <button class="mini noprint" title="uložit natrvalo do ceníku – bude ve všech nových nabídkách" onclick="vlastniDoCeniku('${sekceKey}', ${r.idx})">📌</button>` : '';
  const reset = (!r.vlastni && r.nazevPrepsan) ? ` <button class="mini noprint" title="vrátit původní název (${esc(r.origNazev)})" onclick="nazevReset('${orig}')">↺</button>` : '';
  const onch = r.vlastni ? `vlastniSet('${sekceKey}', ${r.idx}, 'nazev', this.value)` : `nazevSet('${orig}', this.value)`;
  const pozn = r.pozn ? ` <span class="note">(${esc(r.pozn)})</span>` : '';
  return `<input type="text" class="nazev-ed" value="${esc(r.nazev)}" onchange="${onch}" title="název položky lze přepsat">${reset}${pin}${del}${pozn}`;
}
function bunkaMnozstvi(r) {
  if (r.vlastni)
    return `<input type="number" step="any" style="width:86px" value="${+(+r.mnozstvi).toFixed(3)}" onchange="vlastniSet('${r.sekce}', ${r.idx}, 'mnozstvi', this.value)">`;
  const orig = keyAttr(r.origNazev);
  return `<input type="number" step="any" style="width:86px" value="${+(+r.mnozstvi).toFixed(3)}" onchange="mnozstviSet('${orig}', this.value)" title="množství lze ručně přepsat">` +
    (r.prepsano ? ` <button class="mini noprint" title="vrátit vypočtené množství (${num(r.mnozstviAuto, 3)})" onclick="mnozstviSet('${orig}', '')">↺</button>` : '');
}
function bunkaCena(r) {
  if (r.vlastni)
    return `<input type="number" step="any" style="width:96px" value="${+(+r.cena).toFixed(2)}" onchange="vlastniSet('${r.sekce}', ${r.idx}, 'cena', this.value)">`;
  if (r.cenaPath)
    return `<input type="number" step="any" style="width:96px" value="${+(+r.cena).toFixed(2)}" onchange="set('${r.cenaPath}', +this.value)" title="jedn. cena z ceníku – změna se propíše i do Ceníku nákladů (obousměrně)">`;
  const orig = keyAttr(r.origNazev);
  return `<input type="number" step="any" style="width:96px" value="${+(+r.cena).toFixed(2)}" onchange="cenaSet('${orig}', this.value)" title="jedn. cena – ruční přepis (bez ceníkové vazby)">` +
    (r.cenaPrepsana ? ` <button class="mini noprint" title="vrátit vypočtenou cenu (${fmt(r.cenaAuto)})" onclick="cenaSet('${orig}', '')">↺</button>` : '');
}
/* ---- stabilní klíč řádku (pro pořadí a viditelnost) ---- */
function radekKey(r) {
  if (r.key) return r.key;                                   // volitelné katalog má vlastní klíč
  return r.vlastni ? ('vlastni:' + r.sekce + ':' + r.idx) : r.origNazev;
}
function jeSkryta(key) { return (Z.skryteProUzivatele || []).includes(key); }
function viditelnostSet(key, viditelne) {
  if (!Z.skryteProUzivatele) Z.skryteProUzivatele = [];
  Z.skryteProUzivatele = Z.skryteProUzivatele.filter(k => k !== key);
  if (!viditelne) Z.skryteProUzivatele.push(key);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function volitelneVychoziSet(key, v) {
  if (!Z.volitelneVychozi) Z.volitelneVychozi = {};
  Z.volitelneVychozi[key] = !!v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* seřazení řádků sekce dle uloženého pořadí (Z.poradi[sekce]); neuvedené na konec */
function serazSekci(rows, sekceKey) {
  const poradi = Z.poradi && Z.poradi[sekceKey];
  if (!poradi || !poradi.length) return rows;
  const idx = k => { const i = poradi.indexOf(k); return i < 0 ? 1e9 : i; };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (idx(radekKey(a.r)) - idx(radekKey(b.r))) || (a.i - b.i)).map(x => x.r);
}
/* ---- přetahování řádků v rámci sekce (jen admin) ---- */
let _dragKey = null, _dragSek = null;
function dragStart(e, sek, key) { _dragSek = sek; _dragKey = key; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', key); } catch (_) {} } }
function dragOver(e) { if (_dragKey != null) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } }
function dragDrop(e, sek, key) { e.preventDefault(); if (_dragSek === sek && _dragKey != null && _dragKey !== key) presunRadek(sek, _dragKey, key); _dragKey = null; _dragSek = null; }
function presunRadek(sekceKey, fromKey, toKey) {
  let r; try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) { return; }
  const zdroj = sekceKey === 'volitelne' ? r.volitelneKatalog : (r.sekce[sekceKey] || []);
  let ord = serazSekci(zdroj, sekceKey).map(radekKey).filter(k => k !== fromKey);
  const ti = ord.indexOf(toKey);
  ord.splice(ti < 0 ? ord.length : ti, 0, fromKey);
  if (!Z.poradi) Z.poradi = {};
  Z.poradi[sekceKey] = ord;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

/* viditelnost sloupců podle role/nastavení + koncové admin sloupce (viditelnost, výchozí) */
function kalkSloupce() {
  /* Dřív `jeAdmin()`. Sloupce s nákladem a přirážkou (a s nimi koncové
   * sloupce Viditelnost / Výchozí) teď stojí na právu `sloupce.naklad`, aby
   * je šlo přidělit vedoucímu bez zbytku administrátorských funkcí. Výchozí
   * matice právo nikomu nedává, takže se dnešní chování nemění. */
  const admin = smiZobrazit('sloupce.naklad');
  const showCost = admin && NAST.zobrazitNaklady;
  const adminExtra = admin ? 2 : 0;
  return { admin, showCost, adminExtra, NC: 2 + (admin ? 1 : 0) + (showCost ? 2 : 0) + 1 + adminExtra };
}
function poznHtml(r) { return r.pozn ? ` <span class="note">(${esc(r.pozn)})</span>` : ''; }
/* Atypická položka bez ceny (#7). Nula v ceníku vypadá v tabulce úplně stejně
 * jako skutečná nula a v součtu po ní nezůstane stopa – nabídka by práci navíc
 * rozdala zdarma a přišlo by se na to až při fakturaci. Proto je vidět přímo
 * u řádku, nejen v kontrolách před nabídkou, a vidí ji i běžný uživatel:
 * je to on, kdo nabídku skládá. Částku odznak nenese (běžný uživatel náklady
 * nevidí, #36) a do tisku nejde – je to poznámka pro nás, ne pro zákazníka. */
function bezCenyHtml(r) {
  return r && r.bezCeny ? ' <span class="pill warn noprint" title="Atypická práce nemá cenu – doplňte sazbu v ceníku (sekce ATYP), nebo položku odeberte.">bez ceny</span>' : '';
}
function gripHtml(r, sekceKey) {
  return `<span class="grip" draggable="true" ondragstart="dragStart(event,'${sekceKey}','${keyAttr(radekKey(r))}')" title="přetáhnout řádek">⠿</span>`;
}
function adminKoncBunky(r, sekceKey) {
  const key = radekKey(r), ka = keyAttr(key);
  const vis = `<td class="admincol"><input type="checkbox" ${jeSkryta(key) ? '' : 'checked'} onchange="viditelnostSet('${ka}', this.checked)" title="viditelné pro běžného uživatele"></td>`;
  const vych = `<td class="admincol">${sekceKey === 'volitelne'
    ? `<input type="checkbox" ${(Z.volitelneVychozi || {})[key] ? 'checked' : ''} onchange="volitelneVychoziSet('${ka}', this.checked)" title="výchozí zaškrtnutí volitelné položky">` : ''}</td>`;
  return vis + vych;
}
function radekKalk(r, sekceKey) {
  const { admin, showCost } = kalkSloupce();
  const key = radekKey(r);
  const dz = admin ? ` ondragover="dragOver(event)" ondrop="dragDrop(event,'${sekceKey}','${keyAttr(key)}')"` : '';
  let c = `<td style="white-space:normal">${admin ? `<div class="vol-name">${gripHtml(r, sekceKey)}${bunkaNazev(r, sekceKey)}${bezCenyHtml(r)}</div>` : esc(r.nazev) + poznHtml(r) + bezCenyHtml(r)}</td>`;
  c += `<td style="white-space:nowrap">${admin ? bunkaMnozstvi(r) : num(r.mnozstvi, 3)}</td>`;
  if (admin) c += `<td style="white-space:nowrap">${bunkaCena(r)}</td>`;
  if (showCost) c += `<td>${fmt(r.naklad)}</td><td>${fmt(r.marze)}</td>`;
  c += `<td>${fmt(r.sMarzi)}</td>`;
  if (admin) c += adminKoncBunky(r, sekceKey);
  return `<tr${dz}>${c}</tr>`;
}
function radekPridat(sekceKey, popis) {
  const { NC } = kalkSloupce();
  return `<tr class="pridat noprint"><td colspan="${NC}"><button class="mini" onclick="vlastniAdd('${sekceKey}')">+ ${popis}</button></td></tr>`;
}
function sumRadek(cls, label, sum) {
  const { admin, showCost } = kalkSloupce();
  let c = `<td>${label}</td><td></td>`;
  if (admin) c += `<td></td>`;
  if (showCost) c += `<td>${fmt(sum.naklad)}</td><td>${fmt(sum.marze)}</td>`;
  c += `<td>${fmt(sum.sMarzi)}</td>`;
  if (admin) c += `<td class="admincol"></td><td class="admincol"></td>`;
  return `<tr class="${cls}">${c}</tr>`;
}
function tbl(rows, sum, nazevSekce, sekceKey) {
  const { admin, NC } = kalkSloupce();
  rows = serazSekci(rows, sekceKey);
  if (!admin) rows = rows.filter(r => !jeSkryta(radekKey(r)));   // skryté položky uživatel nevidí
  // id řádku s názvem sekce = cíl kotvy v klouzající liště (kalkLista)
  return `<tr class="sechd" id="ock-sek-${sekceKey}"><td colspan="${NC}">${nazevSekce}</td></tr>` +
    rows.map(r => radekKalk(r, sekceKey)).join('') +
    (admin ? radekPridat(sekceKey, 'přidat položku do sekce') : '') +
    /* ATYP má vlastní sekci v zadání i v ceníku, ale v kalkulaci a v nabídce
     * spadá do HRUBÉ OCK – zákazník má vidět jednu ocelovou konstrukci, ne
     * účet za „něco navíc". Tlačítko je proto tady, ne ve vlastní tabulce (#7). */
    (admin && sekceKey === 'hrubaOck' ? radekPridat('atyp', 'přidat atypickou položku (práce navíc)') : '') +
    sumRadek('sectot', nazevSekce + ' CELKEM', sum);
}
/* Volitelné položky – zaškrtávátkem přímo v hlavním sloupci (jako příplatky) */
function tblVolitelne(katalog, sum) {
  const { admin, showCost, NC } = kalkSloupce();
  let rows = serazSekci(katalog, 'volitelne');
  if (!admin) rows = rows.filter(r => r.zahrnuto && !jeSkryta(radekKey(r)));   // uživatel: jen zahrnuté a viditelné
  return `<tr class="sechd" id="ock-sek-volitelne"><td colspan="${NC}">VOLITELNÉ POLOŽKY DO ZÁKLADNÍ CENY ${admin ? '<span class="note" style="font-weight:400">(zaškrtnuté se počítají do základní ceny)</span>' : ''}</td></tr>` +
    rows.map(r => {
      const key = radekKey(r);
      const dz = admin ? ` ondragover="dragOver(event)" ondrop="dragDrop(event,'volitelne','${keyAttr(key)}')"` : '';
      let c;
      if (admin) {
        const chk = r.vlastni ? '<span class="vol-spacer"></span>'
          : `<input type="checkbox" ${r.zahrnuto ? 'checked' : ''} onchange="volitelneToggle('${escJs(r.key)}', this.checked)" title="zahrnout do základní ceny">`;
        c = `<td style="white-space:normal"><div class="vol-name">${gripHtml(r, 'volitelne')} ${chk}${bunkaNazev(r, 'volitelne')}</div></td>`;
        c += `<td style="white-space:nowrap">${bunkaMnozstvi(r)}</td><td style="white-space:nowrap">${bunkaCena(r)}</td>`;
      } else {
        c = `<td style="white-space:normal">${esc(r.nazev) + poznHtml(r)}</td><td style="white-space:nowrap">${num(r.mnozstvi, 3)}</td>`;
      }
      if (showCost) c += `<td>${fmt(r.naklad)}</td><td>${fmt(r.marze)}</td>`;
      c += `<td>${fmt(r.sMarzi)}</td>`;
      if (admin) c += adminKoncBunky(r, 'volitelne');
      return `<tr${dz}${r.zahrnuto ? '' : ' style="opacity:.5"'}>${c}</tr>`;
    }).join('') +
    (admin ? radekPridat('volitelne', 'přidat vlastní volitelnou položku') : '') +
    sumRadek('sectot', 'VOLITELNÉ CELKEM (jen zaškrtnuté)', sum);
}

/* Výběr příplatků, které se propíší do cenové nabídky */
function priplatekNabidka(key, zahrnout) {
  if (!Z.priplatkyVynechat) Z.priplatkyVynechat = [];
  Z.priplatkyVynechat = Z.priplatkyVynechat.filter(k => k !== key);
  if (!zahrnout) Z.priplatkyVynechat.push(key);
  render();
}
/* Vlastní příplatkové položky */
function priplatekVlastniAdd() { if (!Z.priplatkyVlastni) Z.priplatkyVlastni = []; Z.priplatkyVlastni.push({ nazev: 'Nový příplatek', mnozstvi: 1, cena: 0 }); aktivniVarianta(ZAK).upraveno = new Date().toISOString(); render(); }
function priplatekVlastniDel(i) {
  const p = Z.priplatkyVlastni[i];
  if (p && p.kid) {
    if (!confirm('Příplatek „' + p.nazev + '" je trvalý (z ceníku).\n\nSmazat jen v této zakázce?\nV ceníku a v nových nabídkách zůstane.')) return;
    katalogZapamatujOdebrani(Z, p);
  }
  Z.priplatkyVlastni.splice(i, 1);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* vlastní příplatek uložit natrvalo do ceníku */
function priplatekDoCeniku(i) {
  katalogUloz(KATALOG, Z, 'priplatky', i);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function priplatekVlastniSet(i, k, v) {
  const p = Z.priplatkyVlastni[i];
  if (!p) return;
  const puvodni = p.nazev;
  p[k] = k === 'nazev' ? v : +v;
  if (k === 'nazev' && puvodni && puvodni !== p.nazev) prepisyPrejmenuj(Z, puvodni, p.nazev);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

/* ---------- sirotčí ruční přepisy (#4) ----------
 * Přepis množství / ceny / názvu je klíčovaný názvem položky. Když položka
 * z výpočtu zmizí nebo se přejmenuje mimo hlídané cesty (import staršího
 * souboru, ruční úprava JSONu, změna ceníku ve starší verzi), přepis zůstane
 * v datech, ale už se na nic nenaváže – navenek to vypadá, že se ruční úprava
 * ztratila. Kartu ukazujeme jen administrátorovi a úklid je vždy jeho vědomé
 * rozhodnutí: sirotek může být dočasný (položka je jen vypnutá nastavením
 * šachty a po přepnutí se vrátí i s přepisem). */
function sirotciUklidVse() {
  let r; try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) { return; }
  const s = prepisySirotci(Z, r.nazvyPolozek);
  if (!s.length) return render();
  if (!confirm('Smazat ' + s.length + ' nepoužitý ruční přepis/y?\n\nTýká se jen přepisů, které v tomto výpočtu nemají odpovídající položku. Vrátit zpět to lze tlačítkem „Zpět“ (Ctrl+Z).')) return;
  prepisyUklid(Z, s);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function sirotekUklid(mapa, klic) {
  prepisyUklid(Z, [{ mapa, klic }]);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function sirotciKarta(r) {
  if (!jeAdmin()) return '';
  const s = prepisySirotci(Z, r.nazvyPolozek);
  if (!s.length) return '';
  const radky = s.map(x => `<tr>
      <td style="white-space:normal">${esc(x.klic)}</td>
      <td>${esc(x.popis)}</td>
      <td style="white-space:nowrap">${esc(prepisHodnotaText(x))}</td>
      <td class="noprint"><button class="mini" title="smazat tento přepis" onclick="sirotekUklid('${escJs(x.mapa)}', '${escJs(x.klic)}')">✕</button></td>
    </tr>`).join('');
  return card(`Nepoužité ruční přepisy (${s.length})`,
    `<div class="note">Tyto ruční úpravy jsou uložené u položek, které se v aktuálním výpočtu nevyskytují –
       typicky proto, že se položka přejmenovala nebo ji vyřadilo jiné nastavení šachty. <b>Na výslednou cenu
       nemají vliv.</b> Pokud jde o položku, která se sem ještě vrátí, nechte je být; jinak je můžete uklidit.</div>
     <table><tr><th>Položka (klíč přepisu)</th><th>Druh přepisu</th><th>Hodnota</th><th class="noprint"></th></tr>
       ${radky}</table>
     <div class="noprint" style="margin-top:8px"><button class="mini" onclick="sirotciUklidVse()">Uklidit všechny nepoužité přepisy</button></div>`);
}

function renderOutputs() {
  let r;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); }
  catch (e) {
    const elS = document.getElementById('kalk-souhrn'); if (elS) elS.innerHTML = '';
    document.getElementById('outputs').innerHTML = `<div class="card"><div class="body neg">Chyba výpočtu: ${esc(e.message)}</div></div>`; return; }
  // štítek režimu výpočtu se obnovuje v render() (viz renderRezimPill v common.js),
  // aby zůstal správný i tehdy, když výpočet spadne a tahle funkce skončí dřív
  const s = r.souctySekci, o = r.odvozene, p = r.parametry;

  const col = kalkSloupce();
  // hodnoty hlavičky – zohlední schválenou slevu (jinak podíl 0)
  // koncovou cenu skládá zaokrouhleni.js (#38), ať hlavička ukazuje totéž co nabídka
  const cn = (typeof cenaNabidkyOck === 'function') ? cenaNabidkyOck(r, SL, ZO) : null;
  const podil = cn ? cn.slevaPct : ((typeof slevaPodil === 'function') ? slevaPodil(SL) : 0);
  const zaklad = r.souhrn.zakladCena;
  const slevaKc = cn ? cn.slevaKc : zaklad * podil;
  const cenaPoSleve = cn ? cn.cena : zaklad - slevaKc;
  const _dph = cenaSDph(cenaPoSleve, C.dph), dphKc = _dph.dphKc, celkemSDph = _dph.sDph;   // #14 krok 1
  const naklad = r.souhrn.zakladNaklad, hrubyZisk = cenaPoSleve - naklad;
  const marze = cenaPoSleve > 0 ? hrubyZisk / cenaPoSleve : 0;
  const kv = NAST.kpiViditelne || {};
  const vidKpi = k => col.admin || kv[k];
  const kpiChk = k => col.admin ? `<input type="checkbox" class="kpi-chk" ${kv[k] ? 'checked' : ''} onchange="kpiVidSet('${k}', this.checked)" title="zviditelnit pro běžného uživatele">` : '';
  const kpiLine = (k, label, val) => vidKpi(k)
    ? `<div class="kpi-line"><span class="kl">${label}${kpiChk(k)}</span><span class="kv">${val}</span></div>` : '';
  const pct = x => (Math.round(x * 1000) / 10).toLocaleString('cs-CZ') + ' %';
  const box3 = kpiLine('naklad', 'Náklad', fmt0(naklad)) + kpiLine('hrubyZisk', 'Hrubý zisk', fmt0(hrubyZisk));
  const box4 = kpiLine('sleva', 'Poskytnutá sleva', pct(podil)) + kpiLine('marze', 'Marže', pct(marze));
  /* Obchodní zaokrouhlení (#38) vidí každý – je to cena, ne náklad. Ukazuje se
   * jen když opravdu něco změnilo, jinak by hlavička nesla prázdný řádek. */
  const zaokrLine = (cn && cn.zaokrKc && typeof zaokrKc === 'function')
    ? `<div class="kpi-line"><span class="kl">Obchodní zaokrouhlení</span><span class="kv">${esc(zaokrKc(cn.zaokrKc))}</span></div>`
      + `<div class="kpi-line"><span class="kl">Cena nabídky bez DPH</span><span class="kv">${fmt0(cenaPoSleve)}</span></div>`
    : '';
  const hlava = `<div class="kalk-title">${ZAK.cislo ? `<span class="kt-cislo">${esc(ZAK.cislo)}</span>` : ''}${esc(ZAK.nazevAkce || 'Bez názvu akce')}</div>
  <div class="grand">
    <div class="kpi main"><div class="l">Základní cena bez DPH</div><div class="v">${fmt0(zaklad)}</div></div>
    <div class="kpi kpi-multi">
      ${zaokrLine}
      <div class="kpi-line"><span class="kl">DPH ${Math.round(C.dph * 100)} %</span><span class="kv">${fmt0(dphKc)}</span></div>
      <div class="kpi-line"><span class="kl">Celkem s DPH</span><span class="kv">${fmt0(celkemSDph)}</span></div>
    </div>
    ${box3 ? `<div class="kpi kpi-multi">${box3}</div>` : ''}
    ${box4 ? `<div class="kpi kpi-multi">${box4}</div>` : ''}
  </div>`;

  const thCena = col.admin ? 'Cena vč. přirážky' : 'Cena';
  const adminTh = col.admin ? '<th class="admincol" title="viditelné pro běžného uživatele">Viditelné</th><th class="admincol" title="výchozí zaškrtnutí volitelné položky">Výchozí</th>' : '';
  const adminTd = col.admin ? '<td class="admincol"></td><td class="admincol"></td>' : '';
  const kalkulace = `<table>
    <tr><th>Položka</th><th>Množství</th>${col.admin ? '<th>Jedn. cena</th>' : ''}${col.showCost ? '<th>Náklad</th><th>Přirážka</th>' : ''}<th>${thCena}</th>${adminTh}</tr>
    ${tbl(r.sekce.hrubaOck, s.hrubaOck, 'HRUBÁ OCK', 'hrubaOck')}
    ${tbl(r.sekce.oplasteni, s.oplasteni, 'OPLÁŠTĚNÍ', 'oplasteni')}
    ${tblVolitelne(r.volitelneKatalog, s.volitelne)}
    ${tbl(r.sekce.rezie, s.rezie, 'REŽIE', 'rezie')}
    ${Z.rezervaZakladPct ? `<tr><td>REZERVA (${num(Z.rezervaZakladPct * 100)} %)</td><td></td>${col.admin ? '<td></td>' : ''}${col.showCost ? `<td>${fmt(r.rezerva.naklad)}</td><td>${fmt(r.rezerva.marze)}</td>` : ''}<td>${fmt(r.rezerva.sMarzi)}</td>${adminTd}</tr>` : ''}
    <tr class="tot"><td>CELKEM (zaokrouhleno ↑ na tisíce)</td><td></td>${col.admin ? '<td></td>' : ''}${col.showCost ? `<td>${fmt(r.souhrn.zakladNaklad)}</td><td>${fmt(r.souhrn.zakladMarze)}</td>` : ''}<td>${fmt0(r.souhrn.zakladCena)}</td>${adminTd}</tr>
  </table>
  ${col.admin ? `<div class="note">Řádky přetáhnete úchopem <b>⠿</b> vlevo (v rámci sekce). Zaškrtávátko <b>Viditelné</b> určuje,
  zda položku vidí běžný uživatel; u volitelných navíc <b>Výchozí</b> určuje výchozí zaškrtnutí. Název i jednotkovou cenu
  lze přepsat přímo v tabulce (cena s ceníkovou vazbou obousměrně s Ceníkem).</div>` : ''}`;

  const vynech = Z.priplatkyVynechat || [];
  const pripNazev = (x) => {
    const orig = keyAttr(x.origNazev);
    if (x.vlastni) {
      const i = +String(x.key).split(':')[1];
      const pinP = (!x.kid && jeAdmin())
        ? ` <button class="mini noprint" title="uložit natrvalo do ceníku – bude ve všech nových nabídkách" onclick="priplatekDoCeniku(${i})">📌</button>` : '';
      const trv = x.kid ? ' <span class="pill ok" title="trvalá položka z ceníku">trvalá</span>' : '';
      return `<input type="text" class="nazev-ed" value="${esc(x.nazev)}" onchange="priplatekVlastniSet(${i}, 'nazev', this.value)" title="název příplatku">${trv}${pinP}
        <button class="mini noprint" title="smazat příplatek" onclick="priplatekVlastniDel(${i})">✕</button>`;
    }
    const reset = x.nazevPrepsan ? ` <button class="mini noprint" title="vrátit původní název" onclick="nazevReset('${orig}')">↺</button>` : '';
    return `<input type="text" class="nazev-ed" value="${esc(x.nazev)}" onchange="nazevSet('${orig}', this.value)" title="název příplatku lze přepsat">${reset}`;
  };
  const pripMnozstvi = (x) => x.vlastni
    ? `<input type="number" step="any" style="width:80px" value="${+(+x.mnozstvi).toFixed(3)}" onchange="priplatekVlastniSet(${+String(x.key).split(':')[1]}, 'mnozstvi', this.value)">`
    : num(x.mnozstvi, 3);
  const pripCena = (x) => x.vlastni
    ? `<input type="number" step="any" style="width:96px" value="${+(+x.cena).toFixed(2)}" onchange="priplatekVlastniSet(${+String(x.key).split(':')[1]}, 'cena', this.value)">`
    : (x.cenaPath
        ? `<input type="number" step="any" style="width:96px" value="${+(+x.cena).toFixed(2)}" onchange="set('${x.cenaPath}', +this.value)" title="jedn. cena z ceníku – propíše se i do Ceníku (obousměrně)">`
        : fmt(x.cena));
  const pripHlava = (col.admin ? '<th title="zaškrtnuté položky se propíší do cenové nabídky">Nabídka</th>' : '')
    + '<th>Položka</th><th>Množství</th>' + (col.admin ? '<th>Jedn. cena</th>' : '')
    + (col.showCost ? '<th>Náklad</th>' : '') + '<th>Cena vč. přirážky</th>'
    + (col.admin ? '<th class="admincol" title="viditelné pro běžného uživatele">Viditelné</th>' : '');
  const pripRadek = (x) => {
    let c = '';
    if (col.admin) c += `<td style="text-align:center"><input type="checkbox" ${vynech.includes(x.key) ? '' : 'checked'}
        onchange="priplatekNabidka('${keyAttr(x.key)}', this.checked)" title="propsat do cenové nabídky"></td>`;
    c += `<td style="white-space:normal">${col.admin ? pripNazev(x) : esc(x.nazev)}</td>`;
    c += `<td style="white-space:nowrap">${col.admin ? pripMnozstvi(x) : num(x.mnozstvi, 3)}</td>`;
    if (col.admin) c += `<td style="white-space:nowrap">${pripCena(x)}</td>`;
    if (col.showCost) c += `<td>${fmt(x.naklad)}</td>`;
    c += `<td>${fmt0(x.sMarzi)}</td>`;
    if (col.admin) c += `<td class="admincol"><input type="checkbox" ${jeSkryta(x.key) ? '' : 'checked'} onchange="viditelnostSet('${keyAttr(x.key)}', this.checked)" title="viditelné pro běžného uživatele"></td>`;
    return `<tr>${c}</tr>`;
  };
  const pripRows = col.admin ? r.priplatky : r.priplatky.filter(x => !jeSkryta(x.key));
  const pripCols = (col.admin ? 1 : 0) + 2 + (col.admin ? 1 : 0) + (col.showCost ? 1 : 0) + 1 + (col.admin ? 1 : 0);
  const prip = `<table>
    <tr>${pripHlava}</tr>
    ${pripRows.map(pripRadek).join('')}
    ${col.admin ? `<tr class="pridat noprint"><td colspan="${pripCols}"><button class="mini" onclick="priplatekVlastniAdd()">+ přidat vlastní příplatek</button></td></tr>` : ''}
    <tr class="tot"><td colspan="${pripCols - 1 - (col.admin ? 1 : 0)}">PŘÍPLATKY CELKEM (pokud vše)</td><td>${fmt0(r.souhrn.priplatkyCena)}</td>${col.admin ? '<td class="admincol"></td>' : ''}</tr>
  </table>
  <div class="note">Příplatkové položky jsou ceník variant pro zákazníka – do základní ceny se nezapočítávají.${col.admin ? `
  Název i jedn. cenu lze přepsat, tlačítkem lze přidat vlastní příplatek. Sloupec <b>Nabídka</b> určuje, které
  příplatky se propíší do generované cenové nabídky (sekce II.). Položky zvolené ve „Volitelné" se zde
  automaticky nenabízejí podruhé, aby nedošlo k dvojímu započtení.` : ''}</div>`;

  const det = `
    <table><tr class="subhead"><td colspan="4">Odvozené parametry</td></tr>
    <tr><td>Výška šachty</td><td>${num(o.vyskaSachty, 3)} m</td><td>Výška podlaží</td><td>${num(o.vyskaPodlazi, 3)} m</td></tr>
    <tr><td>Světlá výška nástupiště</td><td>${num(o.svetlaVyska, 3)} m</td><td>Výška prosklené části</td><td>${num(o.vyskaProsklene, 3)} m</td></tr>
    <tr><td>Šířka otvoru š. dveří</td><td>${num(o.sirkaDveri, 3)} m</td><td>Lešení věž / U-dokola</td><td>${num(o.leseniVez, 2)} m / ${num(o.leseniU, 2)} m²</td></tr>
    <tr class="subhead"><td colspan="4">Konstrukce</td></tr>
    <tr><td>Počet rámů</td><td>${p.ramy}</td><td>Portálové příčníky</td><td>${p.portPricniky}</td></tr>
    <tr><td>Spojky sloupků</td><td>${p.spojky}</td><td>Počet čílek (int)</td><td>${p.pocetCilek}</td></tr>
    <tr class="subhead"><td colspan="4">Materiál</td></tr>
    <tr><td>Profily celkem</td><td>${num(r.profily.celkemM, 2)} m · ${num(r.profily.celkemKg, 1)} kg</td>
        <td>Lemování ext</td><td>${num(r.profily.lemovani.m, 2)} m · ${num(r.profily.lemovani.kg, 1)} kg</td></tr>
    <tr><td>Konstrukční plechy</td><td>${r.plechy.ks} ks · ${num(r.plechy.kg, 1)} kg</td>
        <td>Terče / lišty</td><td>${r.dily.terceKs} ks / ${num(r.dily.listyBm, 1)} bm</td></tr>
    <tr><td>Oplechování dveří</td><td>${r.dily.oplDvereKs} ks · ${num(r.dily.oplDvereKg, 1)} kg</td>
        <td>Přechodové plechy</td><td>${r.dily.prechKs} ks · ${num(r.dily.prechKg, 1)} kg</td></tr>
    <tr class="subhead"><td colspan="4">Zasklení (rozměr skla ${num(r.zaskleni.rozmer.sir, 3)}×${num(r.zaskleni.rozmer.vys, 3)} m)</td></tr>
    <tr><td>Zadní stěna</td><td>${r.zaskleni.zadni.ks} ks · ${num(r.zaskleni.zadni.m2, 2)} m²</td>
        <td>Boční stěny</td><td>${r.zaskleni.bocni.ks} ks · ${num(r.zaskleni.bocni.m2, 2)} m²</td></tr>
    <tr><td>Světlíky</td><td>${r.zaskleni.svetliky.ks + r.zaskleni.svetlikyBoky.ks} ks · ${num(r.zaskleni.svetliky.m2 + r.zaskleni.svetlikyBoky.m2, 2)} m²</td>
        <td><b>Zasklení celkem</b></td><td><b>${num(r.zaskleni.celkemM2, 2)} m²</b></td></tr>
    <tr class="subhead"><td colspan="4">Práce</td></tr>
    <tr><td>Montáž – hodiny navíc</td><td>${num(r.montaz.hodinyNavicCelkem, 2)} h</td>
        <td>Montáž celkem (4 os.)</td><td>${num(r.montaz.hodCelkem, 1)} h · ${num(r.montaz.dni, 1)} dní</td></tr>
    <tr><td>Lakování – Tomáš</td><td>${fmt(r.lakovani.tomas)}</td><td>Lakování – lakovna</td><td>${fmt(r.lakovani.lakovna)}</td></tr>
    <tr><td>Spojovací materiál</td><td>${fmt(r.spojovaci.celkem)}</td><td>Nýtování</td><td>${r.spojovaci.nytovaniKs} ks</td></tr>
    </table>`;

  /* Souhrn (základní cena, DPH, náklad, marže) stojí NAD zadáním šachty —
   * rozvržení 3. 8. 2026: souhrn → zadání → dimenze → práce a režie →
   * cenová kalkulace, vše na plnou šířku jako v kalkulaci PROJ. */
  const elSouhrn = document.getElementById('kalk-souhrn');
  if (elSouhrn) elSouhrn.innerHTML =
    `<div class="card"><div class="body">${hlava}${marzeLista({ cast: 'ock' })}</div></div>`;
  document.getElementById('outputs').innerHTML =
    (elSouhrn ? '' : `<div class="card"><div class="body">${hlava}${marzeLista({ cast: 'ock' })}</div></div>`) +
    card('Cenová kalkulace', kalkulace, false, 'ock-kalkulace') +
    card('Příplatkové položky (ceník variant)', prip, false, 'ock-priplatky') +
    sirotciKarta(r) +
    (col.admin ? card('Detail mezivýpočtů', det) : '');
}

function zkontrolujTl(key) {
  const p = Z.profily[key], tls = Object.keys(JEKLY[p.dim].kg);
  if (!tls.includes(String(p.tl))) p.tl = +tls[Math.floor(tls.length / 2)];
  render();
}
