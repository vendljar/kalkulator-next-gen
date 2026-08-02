/* ================= ZÁLOŽKA DETAIL VÝPOČTU =================
 * Čte výsledek vypocet(Z,C,JEKLY,OCK.fixes) a rozepisuje CELÝ postup
 * kalkulace krok za krokem (vstupy → odvozené → hodiny → konstrukce →
 * profily → plechy → díly → zasklení → práce → lakování → spojovací →
 * cenové sekce s vzorci → rezerva → souhrn → DPH). Jen ke čtení. */

/* DET-1: přepínač zobrazení sloupce se vzorci a poznámkami.
 * Vzorce jsou výchozí ZAPNUTÉ (dosavadní chování se nemění); vypnutím
 * vznikne čistý přehled hodnot pro tisk a pro předání zákazníkovi.
 * Nic se nemaže – sloupec se jen nevykresluje. */
var DETAIL_VZORCE = true;
function detailVzorce(zapnout) { DETAIL_VZORCE = !!zapnout; renderDetail(); }

/* Kotvy jednotlivých kroků – pořadí odpovídá číslům nadpisů. */
var DETAIL_KROKY = [
  ['dv-1', '1. Vstupní zadání'], ['dv-2', '2. Odvozené rozměry'], ['dv-3', '3. Montáž'],
  ['dv-4', '4. Konstrukce'], ['dv-5', '5. Profily'], ['dv-6', '6. Plechy'],
  ['dv-7', '7. Díly'], ['dv-8', '8. Zasklení'], ['dv-9', '9. Spojovací'],
  ['dv-10', '10. Lakování'], ['dv-11', '11. Cenové sekce'], ['dv-12', '12. Souhrn a DPH'],
];

function dvKrok(nadpis, inner, id) {
  return `<div class="dv-krok"${id ? ` id="${id}"` : ''}><h3>${nadpis}</h3><div class="dv-body">${inner}</div></div>`;
}
/* řádky: [popis, hodnota, vzorec/poznámka] – třetí sloupec řídí DET-1 */
function dvTab(rows) {
  // popis (r[0]) a vzorec (r[2]) jsou text – mezi nimi i názvy položek z ceníku,
  // které si uživatel může přejmenovat, proto escapujeme (#6). Prostřední sloupec
  // r[1] je naopak stavěný v kódu a smí obsahovat <b> u souhrnných řádků.
  return `<table class="dv">${rows.map(r =>
    `<tr><td>${esc(r[0])}</td><td class="val">${r[1]}</td>${DETAIL_VZORCE
      ? `<td class="f">${esc(r[2] || '')}</td>` : ''}</tr>`).join('')}</table>`;
}

function renderDetail() {
  const el = document.getElementById('page-detail'); if (!el) return;
  let r;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); }
  catch (e) { el.innerHTML = `<div class="card"><div class="body neg">Chyba výpočtu: ${esc(e.message)}</div></div>`; return; }
  const o = r.odvozene, p = r.parametry, ext = Z.typSachty === 'exteriérová';
  const M = num, K = fmt, K0 = fmt0;
  const rezim = OCK.fixes ? 'opravený výpočet' : '1:1 jako Excel (kompatibilní režim)';

  /* 1) vstupy */
  const krVstup = dvKrok('1. Vstupní zadání (šachta)', dvTab([
    ['Typ šachty', ext ? 'exteriérová' : 'interiérová', 'určuje int/ext větve výpočtu'],
    ['Horní přejezd / Zdvih / Prohlubeň', `${M(Z.prejezd)} / ${M(Z.zdvih)} / ${M(Z.prohluben)} m`, ''],
    ['Vnitřní šířka × hloubka', `${M(Z.sirka)} × ${M(Z.hloubka)} m`, ''],
    ['Svislá rozteč příčníků', `${M(Z.roztec)} m`, ''],
    ['Počet rohových sloupků / nástupišť', `${Z.rohoveSloupky} / ${Z.nastupiste}`, ''],
    ['Typ portálů / zasklení', `${Z.typPortalu} / ${Z.zaskleni}`, ''],
    ['Světlík nad dveřmi / světlíky boky', `${Z.svetlikNadDvermi ? 'ano' : 'ne'} / ${Z.svetlikyBoky}`, ''],
    ['Čistý vstup / šířka rámu dveří', `${Z.cistyVstupMm} / ${Z.sirkaRamuMm} mm`, ''],
  ]), 'dv-1');

  /* 2) odvozené rozměry */
  const krOdv = dvKrok('2. Odvozené rozměry', dvTab([
    ['Výška šachty H', `${M(o.vyskaSachty, 3)} m`, 'H = přejezd + zdvih + prohlubeň'],
    ['Výška podlaží', `${M(o.vyskaPodlazi, 3)} m`, 'zdvih / (počet nástupišť − 1)'],
    ['Světlá výška nástupiště', `${M(o.svetlaVyska, 3)} m`, 'výška podlaží − 0,2'],
    ['Výška prosklené části', `${M(o.vyskaProsklene, 3)} m`, 'zdvih + přejezd'],
    ['Šířka otvoru šach. dveří', `${M(o.sirkaDveri, 3)} m`, '(čistý vstup + 2·rám + 2·20) / 1000'],
    ['Lešení věž / U-dokola', `${M(o.leseniVez, 2)} m / ${M(o.leseniU, 2)} m²`, 'věž = H; U = obvod × výška'],
  ]), 'dv-2');

  /* 3) hodiny navíc (montáž) */
  const hn = r.montaz.hodinyNavic;
  const krHod = dvKrok('3. Montáž – hodiny navíc (atyp)', dvTab([
    ['Za výšku > 21 m', `${M(hn.vyska, 2)} h`, '(H − 21) · 0,5'],
    ['Za šířku > 2 m', `${M(hn.sirka, 2)} h`, 'H · 0,2 (jinak 0)'],
    ['Za hloubku > 2 m', `${M(hn.hloubka, 2)} h`, 'H · 0,2 (jinak 0)'],
    ['Za rohové sloupky > 4', `${M(hn.sloupky, 2)} h`, ''],
    ['Za počet nástupišť', `${M(hn.nastupiste, 2)} h`, 'nástupiště − 6'],
    ['Za exteriér', `${M(hn.exterier, 2)} h`, 'jen ext'],
    ['Za portály (předsazené)', `${M(hn.portaly, 2)} h`, ''],
    ['Za světlík / světlíky boky', `${M(hn.svetlik, 2)} / ${M(hn.svetlikyBoky, 2)} h`, ''],
    ['Hodiny navíc celkem', `${M(r.montaz.hodinyNavicCelkem, 2)} h`, 'součet výše'],
    ['Montáž 1 osoba / 4 osoby', `${M(r.montaz.hod1osoba, 1)} h / ${M(r.montaz.hodCelkem, 1)} h`, `≈ ${M(r.montaz.dni, 1)} dní`],
  ]), 'dv-3');

  /* 4) parametry konstrukce */
  const krKonstr = dvKrok('4. Parametry konstrukce', dvTab([
    ['Počet rámů', `${p.ramy}`, 'strop(H / rozteč + 2) + korekce int/ext'],
    ['Portálové příčníky', `${p.portPricniky}`, '3 · nástupiště'],
    ['Sloupky portálu', `${p.sloupkyPortalu}`, 'nástupiště · světlíky boky'],
    ['Krátké příčníky', `${p.kratkePricniky}`, 'sloupky portálu · 2'],
    ['Spojky sloupků', `${p.spojky}`, 'strop(H/4)·rohové + rohové'],
    ['Počet čílek (int)', `${p.pocetCilek}`, '(rámy·6 + portál·2 + krátké) · int'],
  ]), 'dv-4');

  /* 5) profily */
  const prof = r.profily.rows.map(x => [x.nazev, `${M(x.m, 2)} m · ${M(x.kg, 1)} kg · ${M(x.m2, 3)} m²`,
    `${M(x.j.kg)} kg/m`]);
  const krProf = dvKrok('5. Profily (jekly)', dvTab([
    ...prof,
    ['Rezerva profily (atyp)', `${M(Z.rezervaProfilyPct * 100)} %`, 'násobí délku/hmotnost/plochu'],
    ['Profily celkem', `${M(r.profily.celkemM, 2)} m · ${M(r.profily.celkemKg, 1)} kg · ${M(r.profily.celkemM2, 2)} m²`, ''],
    ['Lemování ext. šachty', `${M(r.profily.lemovani.m, 2)} m · ${M(r.profily.lemovani.kg, 1)} kg`, ext ? '3·H' : 'jen ext (=0)'],
  ]), 'dv-5');

  /* 6) plechy (spoje) */
  const spoje = r.plechy.spojeRows.map(x => [x.key, `${x.spoju} spojů · ${M(x.ks, 1)} ks · ${M(x.kg, 2)} kg · ${M(x.m2, 3)} m²`, '']);
  const krPlech = dvKrok('6. Konstrukční plechy (spoje)', dvTab([
    ...spoje,
    ['Čílka (int)', `${p.pocetCilek} ks · ${M(p.pocetCilek * 0.12, 2)} kg`, '0,12 kg/ks'],
    ['Rezerva plechy (atyp)', `${M(Z.rezervaPlechyPct * 100)} %`, ''],
    ['Plechy celkem', `${r.plechy.ks} ks · ${M(r.plechy.kg, 1)} kg · ${M(r.plechy.m2, 3)} m²`, ''],
  ]), 'dv-6');

  /* 7) díly – terče/lišty/oplechování */
  const d = r.dily;
  const krDily = dvKrok('7. Terče / lišty / oplechování / podesty', dvTab([
    ['Terče', `${d.terceKs} ks · ${M(d.terceKg, 2)} kg`, '0,15 kg/ks · 0,008 m²/ks'],
    ['Lišty', `${d.listyKs} ks · ${M(d.listyBm, 1)} bm · ${M(d.listyKg, 1)} kg`, 'jen při zasklení mezi příčníky'],
    ['Oplechování dveří', `${d.oplDvereKs} ks · ${M(d.oplDvereKg, 1)} kg · ${M(d.oplDvereM2, 2)} m²`, ''],
    ['Podesty (int)', `${d.podestKs} ks · ${M(d.podestKg, 1)} kg · ${M(d.podestM2, 2)} m²`, ''],
    ['Přechodové plechy', `${d.prechKs} ks · ${M(d.prechKg, 2)} kg`, Z.prechodovePlechy ? 'zapnuto' : 'vypnuto'],
  ]), 'dv-7');

  /* 8) zasklení */
  const z = r.zaskleni;
  const krZas = dvKrok('8. Zasklení', dvTab([
    ['Rozměr skla (š×v)', `${M(z.rozmer.sir, 3)} × ${M(z.rozmer.vys, 3)} m`, Z.zaskleni === 'na terče' ? 'terče' : 'mezi příčníky'],
    ['Zadní stěna', `${z.zadni.ks} ks · ${M(z.zadni.m2, 2)} m²`, ''],
    ['Boční stěny', `${z.bocni.ks} ks · ${M(z.bocni.m2, 2)} m²`, ''],
    ['Světlíky / boky', `${z.svetliky.ks} ks · ${M(z.svetliky.m2, 2)} m² / ${z.svetlikyBoky.ks} ks · ${M(z.svetlikyBoky.m2, 2)} m²`, ''],
    ['Boční + zadní m²', `${M(z.bokyZadniM2, 2)} m²`, 'materiál boční/zadní stěna'],
    ['Čelní m² (světlíky)', `${M(z.celniM2, 2)} m²`, 'materiál čelní stěna'],
    ['Zasklení celkem', `${M(z.celkemM2, 2)} m²`, ''],
  ]), 'dv-8');

  /* 9) spojovací materiál */
  const spoj = r.spojovaci.rows.map(x => [x.nazev, `${x.ks} ks × ${M(x.cena)} = ${K(x.celkem)}`, x.vlastni ? 'vlastní položka z ceníku' : '']);
  const krSpoj = dvKrok('9. Spojovací materiál', dvTab([
    ...spoj,
    ['Spojovací celkem', K(r.spojovaci.celkem), ''],
    ['Nýtování', `${r.spojovaci.nytovaniKs} ks`, ''],
  ]), 'dv-9');

  /* 10) lakování */
  const lakVl = (r.lakovani.vlastniRows || []).map(x =>
    [x.nazev, `${M(x.ks, 3)} × ${M(x.cena)} = ${K(x.celkem)}`, 'vlastní položka z ceníku']);
  const krLak = dvKrok('10. Lakování', dvTab([
    ['Režim „Tomáš"', K(r.lakovani.tomas), 'profily/lišty/plechy/oplech./terče'],
    ['Režim „lakovna"', K(r.lakovani.lakovna), ''],
    ...lakVl,
    ...(r.lakovani.vlastniKc ? [['Vlastní položky celkem', K(r.lakovani.vlastniKc), 'přičítá se k oběma režimům']] : []),
    ['Použito ve výpočtu', `${K(r.lakovani.pouzito)} (${r.lakovani.rezim})`, ''],
  ]), 'dv-10');

  /* 11–13) cenové sekce, rezerva, souhrn */
  const sekceBlok = (nazev, rows, sum) => {
    const rr = rows.map(x =>
      `<tr><td>${esc(x.nazev)}</td><td class="val">${M(x.mnozstvi, 3)} × ${K(x.cena)}${x.fix ? ' + fix ' + K0(x.fix) : ''}</td>
       <td class="val">${K(x.naklad)}</td><td class="val">+ ${K(x.marze)}</td><td class="val">${K(x.sMarzi)}</td></tr>`).join('');
    return `<div style="font-weight:700;margin:10px 0 4px">${esc(nazev)}</div>
      <table class="dv"><tr class="f"><td>Položka</td><td class="val">Množství × jedn. cena</td><td class="val">Náklad</td><td class="val">Přirážka</td><td class="val">vč. přirážky</td></tr>
      ${rr}<tr style="font-weight:700;border-top:1.5px solid var(--line)"><td>${esc(nazev)} celkem</td><td></td>
      <td class="val">${K(sum.naklad)}</td><td class="val">${K(sum.marze)}</td><td class="val">${K(sum.sMarzi)}</td></tr></table>`;
  };
  const s = r.souctySekci;
  const krCeny = dvKrok('11. Cenové sekce (náklad + přirážka)',
    sekceBlok('HRUBÁ OCK', r.sekce.hrubaOck, s.hrubaOck) +
    sekceBlok('OPLÁŠTĚNÍ', r.sekce.oplasteni, s.oplasteni) +
    sekceBlok('VOLITELNÉ (jen zaškrtnuté)', r.sekce.volitelne, s.volitelne) +
    sekceBlok('REŽIE', r.sekce.rezie, s.rezie) +
    `<div class="note">Přirážka = náklad × globální přirážka (${M(C.marze * 100)} %).</div>`, 'dv-11');

  const krSouhrn = dvKrok('12. Rezerva, souhrn a DPH', dvTab([
    ['REZERVA základ', `${K(r.rezerva.sMarzi)}`, `sazba ${M(Z.rezervaZakladPct * 100)} % · ${OCK.fixes ? 'z nákladů' : 'z ceny (kompat)'}`],
    ['Náklad celkem', K(r.souhrn.zakladNaklad), ''],
    ['Přirážka celkem', K(r.souhrn.zakladMarze), ''],
    ['ZÁKLADNÍ CENA bez DPH', `<b>${K0(r.souhrn.zakladCena)}</b>`, 'zaokrouhleno ↑ na tisíce'],
    [`DPH ${M(C.dph * 100)} %`, K0(r.souhrn.zakladDph), ''],
    ['CELKEM s DPH', `<b>${K0(r.souhrn.zakladSDph)}</b>`, ''],
    ['Příplatky celkem (pokud vše)', K0(r.souhrn.priplatkyCena), 'ceník variant, mimo základní cenu'],
  ]), 'dv-12');

  /* DET-1 + DET-3: ovládací lišta – vzorce zap/vyp, kotvy na kroky, samostatný tisk. */
  const listaKotev = DETAIL_KROKY.map(([id, nazev]) =>
    `<a class="dv-kotva" href="#${id}" onclick="dvSkoc(event,'${id}')">${nazev}</a>`).join(' ');
  const lista = `<div class="dv-lista noprint">
    <label class="dv-prep"><input type="checkbox" ${DETAIL_VZORCE ? 'checked' : ''}
      onchange="detailVzorce(this.checked)"> zobrazit vzorce a poznámky</label>
    <button class="mini" onclick="detailTisk()">🖨 Tisk / PDF jen detailu výpočtu</button>
    <div class="dv-kotvy">${listaKotev}</div>
  </div>`;

  el.innerHTML =
    `<div class="kalk-title">${Z ? '' : ''}${ZAK.cislo ? `<span class="kt-cislo">${esc(ZAK.cislo)}</span>` : ''}Detail výpočtu — ${esc(ZAK.nazevAkce || 'bez názvu akce')}
      <span class="pill ${OCK.fixes ? '' : 'warn'}" style="margin-left:8px">${rezim}</span></div>
    <div class="note" style="margin-bottom:12px">Kompletní rozpis kalkulace OCK krok za krokem – přesně jak se počítá základní cena.
    Hodnoty se mění živě se zadáním v Kalkulaci OCK.</div>
    ${lista}
    ${krVstup}${krOdv}${krHod}${krKonstr}${krProf}${krPlech}${krDily}${krZas}${krSpoj}${krLak}${krCeny}${krSouhrn}`;
}

/* Plynulý skok na krok bez zanesení kotvy do adresy (aplikace je jednosouborová). */
function dvSkoc(ev, id) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const t = document.getElementById(id);
  if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* DET-3: samostatný tiskový výstup jen detailu výpočtu (bez zbytku aplikace).
 * Respektuje aktuální nastavení přepínače vzorců (DET-1) a firemní hlavičku (SET-3). */
function detailTisk() {
  const src = document.getElementById('page-detail');
  if (!src) return;
  const kopie = src.cloneNode(true);
  kopie.querySelectorAll('.noprint').forEach(x => x.remove());

  const f = (typeof firmaAktualni === 'function') ? firmaAktualni() : null;
  const logoHtml = f && f.logo ? `<img class="logo" src="${esc(f.logo)}" alt="">` : '';
  const patickaHtml = f && typeof firmaPaticka === 'function' && firmaPaticka(f)
    ? `<div class="paticka">${esc(firmaPaticka(f))}</div>` : '';
  const nazev = `Detail vypoctu ${(ZAK.cislo || '').replace(/[^\w.-]+/g, '_')}`.trim();

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
    <title>${esc(nazev)}</title>
    <style>body{font:12.5px/1.5 "Segoe UI",sans-serif;color:#1a2332;max-width:900px;margin:20px auto;padding:0 16px}
    .kalk-title{font-size:17px;font-weight:700;margin:8px 0 4px}
    .kt-cislo{font-weight:600;color:#1d4ed8;margin-right:8px}
    .pill{font-size:11px;border:1px solid #dfe4ec;border-radius:999px;padding:2px 8px;color:#6b7686}
    .note{font-size:11.5px;color:#6b7686;margin:4px 0}
    .dv-krok{border:1px solid #dfe4ec;border-radius:8px;margin-bottom:12px;overflow:hidden;page-break-inside:avoid}
    .dv-krok > h3{font-size:12.5px;margin:0;padding:7px 12px;background:#1a2332;color:#fff;font-weight:600}
    .dv-krok .dv-body{padding:8px 12px}
    table.dv{width:100%;border-collapse:collapse;font-size:12px}
    table.dv td{padding:3px 7px;border-bottom:1px solid #eef1f5;vertical-align:top}
    table.dv td.f{color:#6b7686;font-size:11px}
    table.dv td.val{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    table.dv td:first-child{font-weight:600}
    table.dv tr.f td{color:#6b7686;font-weight:600}
    .logo{max-height:52px;max-width:230px;display:block;margin-bottom:8px}
    .paticka{margin-top:20px;padding-top:8px;border-top:1px solid #e5e9f0;font-size:11px;color:#6b7686;text-align:center}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px;z-index:5}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    ${tiskListaCss()}
    @page{size:A4;margin:12mm} @media print{.noprint{display:none} body{margin:0}}</style></head><body>
    ${tiskListaHtml({ pozn: 'Komentář k výpočtu lze před uložením do PDF dopsat ručně; do výpočtu se nepropíše.' })}
    <div id="dok">
    ${logoHtml}
    ${kopie.innerHTML}
    ${patickaHtml}
    </div>
    ${tiskListaSkript()}
    </body></html>`);
  w.document.close();
}
