/* ================= ZÁLOŽKA CENÍK NÁKLADŮ =================
 * Definice CENIK_DEF / CENIK_DEF_PROJ jsou v CORE (cenik.js) – jeden zdroj
 * pravdy pro záložku i pro Excel import/export. */

/* mapování ceníkových sekcí na sekce katalogu/kalkulace (kam patří vlastní položky).
 * Odvozeno z KATALOG_SEKCE_NAZEV – jeden zdroj pravdy; nová sekce katalogu tak
 * automaticky dostane i tlačítko „+ přidat“ v ceníku. */
const CENIK_GRP_SEKCE = (() => {
  const m = {};
  Object.keys(KATALOG_SEKCE_NAZEV).forEach(k => { m[KATALOG_SEKCE_NAZEV[k]] = k; });
  return m;
})();

/* ---------- zahraniční sloupec (#181, 31. 8. 2026) ----------
 *
 * Prázdná buňka znamená „stejná jako tuzemská" — udržují se jen odchylky,
 * ne druhá tabulka o třech stech řádcích. Zaškrtávátko „jen zahr." říká,
 * že položka v tuzemské kalkulaci vůbec není (cestovní náklady, překlady);
 * taková se v tuzemské zakázce nezobrazí ani s nulou.
 *
 * Zadává a zveřejňuje JEN administrátor — hlídá to i server. */
function cenikZahrHodnota(path) {
  const z = (typeof CENIK_ZAHR !== 'undefined') ? CENIK_ZAHR : null;
  const v = z && z.ceny ? z.ceny[path] : undefined;
  return v === undefined ? '' : v;
}
function cenikZahrSet(path, hodnota) {
  if (!jeAdmin() || typeof CENIK_ZAHR === 'undefined') return;
  const t = String(hodnota == null ? '' : hodnota).trim();
  if (t === '') delete CENIK_ZAHR.ceny[path];
  else {
    const c = parseFloat(t.replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(c)) return;
    CENIK_ZAHR.ceny[path] = c;
  }
  if (typeof progZprava === 'function')
    progZprava('Zahraniční ceník se změnil — nezapomeňte ho zveřejnit tlačítkem níž, '
      + 'jinak platí jen vám a po odhlášení se ztratí.', 'varovani');
  render();
}
function cenikZahrJenSet(path, ano) {
  if (!jeAdmin() || typeof CENIK_ZAHR === 'undefined') return;
  if (ano) CENIK_ZAHR.jenZahr[path] = true; else delete CENIK_ZAHR.jenZahr[path];
  render();
}

function cenikRows(def, zahrSloupec) {
  return def.map(([grp, items]) => {
    const body = items.map(([path, l, u, note, typ]) => {
      const val = get(path);
      let ed;
      if (typ === 'text') ed = `<input type="text" style="width:130px;text-align:left" value="${esc(val)}" onchange="set('${path}', this.value)">`;
      else if (typ === 'selLak') ed = `<select style="width:130px" onchange="set('${path}', this.value)">
          <option value="tomas" ${val === 'tomas' ? 'selected' : ''}>Tomáš</option>
          <option value="lakovna" ${val === 'lakovna' ? 'selected' : ''}>lakovna</option></select>`;
      /* Procenta se v datech drží jako desetinný podíl (0,30), ale zadávají
       * se lidsky — 30. Stejně jako globální přirážka o pár řádků výš
       * (31. 8. 2026, položky ATYP a výchozí rozsahy práce). */
      else if (typ === 'pct') ed = `<input type="number" step="1" value="${val == null || val === '' ? '' : Math.round(val * 10000) / 100}"
          placeholder="nenastaveno" onchange="set('${path}', this.value === '' ? 0 : (+this.value) / 100)">`;
      else ed = `<input type="number" step="any" value="${esc(val)}" onchange="set('${path}', +this.value)">`;
      let zahr = '';
      if (zahrSloupec) {
        const zv = cenikZahrHodnota(path);
        const jen = (typeof CENIK_ZAHR !== 'undefined') && !!CENIK_ZAHR.jenZahr[path];
        zahr = typ ? '<td colspan="2" class="note">—</td>' : `<td class="zahr-bunka">
          <input type="number" step="any" class="zahr-cena${zv === '' ? '' : ' ma'}" value="${esc(zv)}"
            placeholder="jako ČR" title="prázdné = platí tuzemská cena"
            onchange="cenikZahrSet('${path}', this.value)">
          ${zv === '' ? '' : `<button class="mini noprint" title="převzít tuzemskou cenu"
            onclick="cenikZahrSet('${path}', '')">↺</button>`}</td>
          <td class="zahr-bunka"><label title="položka v tuzemské kalkulaci vůbec není">
            <input type="checkbox" ${jen ? 'checked' : ''}
              onchange="cenikZahrJenSet('${path}', this.checked)"> jen zahr.</label></td>`;
      }
      /* Třídy místo nth-child: se sloupcem Cena Zahraničí má tabulka šest
       * sloupců, ne čtyři, a stará pravidla podle pořadí pak trefila cizí
       * buňky — poznámka zůstala v `white-space:nowrap` a utekla mimo kartu
       * (hlášeno J. V. 1. 9. 2026: „popisný text se nám v ceníku nevejde na
       * stránku"). Třída ví, co je co, ať sloupců přibude kolik chce. */
      return `<tr${zahrSloupec && cenikZahrHodnota(path) !== '' ? ' class="ma-zahr"' : ''}>
        <td class="c-nazev">${l}${klicChip(path)}</td><td class="c-hod">${ed}</td>${zahr}<td class="c-jed">${u}</td><td class="c-pozn">${note}</td></tr>`;
    }).join('');
    const sl = zahrSloupec ? 6 : 4;
    return `<tr class="sec"><td colspan="${sl}">${grp}</td></tr>${body}${cenikCustomRows(CENIK_GRP_SEKCE[grp], sl)}`;
  }).join('');
}
/* Vlastní položky přidané přímo v ceníku (per sekce) = TRVALÉ položky.
 * Zdrojem pravdy je KATALOG (mimo zakázku), takže se propíšou do každé nové
 * cenové nabídky. Změna se okamžitě promítne i do aktuální zakázky. */
function cenikCustomRows(sekceKey, sloupcu) {
  if (!sekceKey || !jeAdmin()) return '';
  const SL = sloupcu || 4;
  /* Trvalé položky mají zahraniční cenu přes ceník řady až tehdy, až se
   * stanou součástí CENIK_DEF — zatím jim sloupec jen dorovná šířku. */
  const mezera = SL > 4 ? '<td colspan="' + (SL - 4) + '" class="note">—</td>' : '';
  const arr = katalogSekce(KATALOG, sekceKey);
  const rows = arr.map(p => `<tr>
      <td><input type="text" value="${esc(p.nazev)}" onchange="katSet('${sekceKey}','${p.kid}','nazev',this.value)"></td>
      <td><input type="number" step="any" value="${+p.cena || 0}" onchange="katSet('${sekceKey}','${p.kid}','cena',this.value)"></td>
      ${mezera}
      <td><input type="number" step="any" style="width:70px" value="${+p.mnozstvi || 1}" onchange="katSet('${sekceKey}','${p.kid}','mnozstvi',this.value)" title="výchozí množství v nové nabídce"></td>
      <td><span class="pill ok" title="je součástí každé nové cenové nabídky">trvalá</span>
          <button class="mini noprint" title="odebrat z ceníku i z této zakázky" onclick="katDel('${sekceKey}','${p.kid}')">✕</button></td></tr>`).join('');
  const lokal = katalogCil(Z, sekceKey).filter(p => !p.kid).length;
  const info = lokal ? `<tr><td colspan="${SL}"><span class="note">V této zakázce je navíc ${lokal} položka/y přidaná přímo v kalkulaci
      (dočasná). Tlačítkem 📌 v Kalkulaci OCK ji uložíš sem natrvalo.</span></td></tr>` : '';
  return rows + info + `<tr class="pridat noprint"><td colspan="${SL}"><button class="mini" onclick="katAdd('${sekceKey}')">+ přidat trvalou položku do sekce</button></td></tr>`;
}

/* --- obsluha trvalých (katalogových) položek ceníku --- */
function katAdd(sekceKey) {
  katalogPridejVc(KATALOG, Z, sekceKey, { nazev: 'Nová položka', mnozstvi: 1, cena: 0 });
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function katSet(sekceKey, kid, klic, hodnota) {
  katalogUpravVc(KATALOG, Z, sekceKey, kid, klic, hodnota);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
async function katDel(sekceKey, kid) {
  const p = katalogNajdi(KATALOG, sekceKey, kid);
  if (!await potvrd('Odebrat trvalou položku „' + ((p && p.nazev) || '') + '" z ceníku?\n\nZmizí i z této zakázky a nebude součástí nových nabídek.')) return;
  katalogSmazVc(KATALOG, Z, sekceKey, kid);
  render();
}

const CENIK_POZN = `<div class="note">Ceník je součástí aktivní varianty a ukládá se se zakázkou (tlačítko „Uložit zakázku") –
  změna cen tady se dotkne <b>jen této varianty</b>. Trvale, tedy pro všechny nové nabídky a přes nová
  sestavení aplikace, se ceny mění tlačítkem <b>Zveřejnit</b> v kartě Platný ceník programu nahoře.</div>`;

function renderCenik() {
  /* Zahraniční sloupec vidí a edituje jen administrátor (#181) — zveřejnění
   * hlídá i server, takže obchodníkovi by k ničemu nebyl. */
  const zahrSl = jeAdmin() && typeof CENIK_ZAHR !== 'undefined';
  const zahrPocet = zahrSl ? Object.keys(CENIK_ZAHR.ceny || {}).length : 0;
  document.getElementById('page-cenik').innerHTML =
    `${smiZobrazit('cenik.zverejnit') ? renderCenikProgramKarta() : ''}
     <div class="card"><h2 style="cursor:default">Ceník nákladů OCK – číselník jednotkových cen
       <span class="pill warn" style="float:right">každou cenu před nabídkou překontrolovat!</span></h2>
     <div class="body">
       ${cenikStariLista()}
       ${cenikVerzeLista()}
       <!-- Globální přirážka a sazba DPH v ceníku OCK (31. 8. 2026, zadání J. V.:
            „vlož globální přirážku do ceníku OCK, stejně jako je tomu v ceníku PROJ,
            a z ceníků ji natahuj do odpovídajících kalkulací"). Je to TÁŽ hodnota
            jako v hlavičce kalkulace — jedno úložiště (ceník varianty), dvě místa
            k zadání, přesně jako u projekce. Zveřejněním se z ní stává výchozí
            přirážka pro každou NOVOU zakázku. -->
       <div class="row" style="max-width:420px">
         ${inp('C.marze', { type: 'pct', l: 'GLOBÁLNÍ PŘIRÁŽKA OCK' })}
       </div>
       <div class="note" style="margin-top:0">Táž hodnota jako v hlavičce Kalkulace OCK —
         změna se projeví na obou místech. <b>Zveřejněním ceníku</b> se z ní stane výchozí
         přirážka každé <b>nové</b> zakázky; rozpracovaným ani odeslaným nabídkám ji nikdo
         nepřepíše (přirážka je rozhodnutí k zakázce, viz #177).</div>
       <div class="note">Sazbu DPH nastavíš v hlavičce Kalkulace OCK. Tlačítkem
         „+ přidat <b>trvalou</b> položku do sekce" založíš položku, která je od té chvíle součástí
         <b>každé nové cenové nabídky</b> (žije mimo zakázku, v katalogu). Položka přidaná přímo v Kalkulaci OCK
         platí jen pro danou zakázku – natrvalo ji uložíš tlačítkem 📌 u řádku. Výchozí zaškrtnutí volitelných
         řešíš v hlavním výpočtovém poli (sloupec „Výchozí").</div>
       <div class="cenik-scroll"><table class="ceniktbl">
         <tr><th class="c-nazev">Položka</th><th>Cena ČR</th>${zahrSl
           ? '<th>Cena Zahraničí</th><th>Jen zahraničí</th>' : ''}<th class="c-jed">Jednotka</th><th class="c-pozn">Poznámka</th></tr>
         ${cenikRows(CENIK_DEF, zahrSl)}
       </table></div>
       ${zahrSl ? `<div class="note">Prázdná buňka ve sloupci <b>Cena Zahraničí</b> znamená
         „stejná jako v ČR“ — udržují se jen odchylky. Zaškrtnutí <b>jen zahraničí</b> říká, že
         položka v tuzemské kalkulaci vůbec není (cestovní náklady, překlady); v tuzemské zakázce
         se pak nezobrazí ani s nulou. Odchylek je teď <b>${zahrPocet}</b>.
         Zveřejňují se spolu s tuzemským ceníkem, jedním tlačítkem a pod jedním číslem verze —
         obě řady tak nemůžou patřit k jiné verzi.</div>` : ''}
       ${smiZobrazit('cenik.import') ? `<div class="btns" style="margin-top:12px">
         <button class="primary" onclick="cenikExport()">⭳ Export do Excelu (OCK+PROJ)</button>
         <button onclick="cenikImport()">⭱ Import z Excelu</button>
       </div>` : ''}
       <div class="btns" style="margin-top:8px">
         <button onclick="resetCenik()">Obnovit výchozí ceník OCK</button>
       </div>
       <div class="note" id="cenikStav">Export vytvoří <b>.xlsx</b> se dvěma listy (Ceník OCK, Ceník PROJ). Uprav ceny v Excelu a nahraj zpět tlačítkem Import – před uložením uvidíš přehled změn.</div>
       ${CENIK_POZN}
     </div></div>`;
}

function renderCenikProj() {
  document.getElementById('page-cenikproj').innerHTML =
    /* Táž karta Databáze programu jako na záložce OCK (zadání 2. 8. 2026).
     * Zveřejnění a verzování je jedno pro obě sady — _program.json nese ceník
     * OCK i PROJ v jedné verzi — takže tohle je druhé vykreslení téže karty
     * nad týmž stavem, stejný vzor jako karty slevy a zaokrouhlení. Karta
     * nenese žádné id (card() bez čtvrtého argumentu), dvojí vykreslení
     * proto nic nezdvojí; hlídá to overit_program.mjs. */
    `${smiZobrazit('cenik.zverejnit') ? renderCenikProgramKarta() : ''}
     <div class="card"><h2 style="cursor:default">Ceník nákladů PROJ – projekční práce
       <span class="pill warn" style="float:right">každou cenu před nabídkou překontrolovat!</span></h2>
     <div class="body">
       ${cenikStariLista()}
       ${cenikVerzeLista()}
       <div class="row" style="max-width:420px">
         ${inp('PC.marze', { type: 'pct', l: 'GLOBÁLNÍ PŘIRÁŽKA PROJ' })}
       </div>
       <div class="cenik-scroll"><table class="ceniktbl">
         <tr><th>Položka</th><th>Cena</th><th>Jednotka</th><th>Poznámka</th></tr>
         ${cenikRows(CENIK_DEF_PROJ)}${cenikProjTrvaleRadky()}
       </table></div>
       ${smiZobrazit('cenik.import') ? `<div class="btns" style="margin-top:12px">
         <button class="primary" onclick="cenikExport()">⭳ Export do Excelu (OCK+PROJ)</button>
         <button onclick="cenikImport()">⭱ Import z Excelu</button>
       </div>` : ''}
       <div class="btns" style="margin-top:8px">
         <button onclick="resetCenikProj()">Obnovit výchozí ceník PROJ</button>
       </div>
       <div class="note">Fixní částky sekcí jsou provázané s kalkulací – změna zde se ihned projeví
       v záložce <b>Kalkulace PROJ</b> (a naopak, úprava částky u položky v kalkulaci se propíše sem).
       Hodiny jednotlivých položek se zadávají v kalkulaci; vlastní přidané položky mají cenu přímo u sebe.</div>
       ${CENIK_POZN}
       <div class="note">Ceník PROJ se zveřejňuje spolu s ceníkem OCK – jedním tlačítkem <b>Zveřejnit</b>
         v kartě <b>Databáze programu</b> nahoře (karta je na obou záložkách ceníku a je to táž karta).
         Obě sady tak vždy patří k téže verzi.</div>
     </div></div>`;
}

/* ---------- trvalé položky projekce v ceníku PROJ (1. 9. 2026) ----------
 *
 * Pokyn J. V.: „nově už budeme trvalé položky přidávat pouze v cenících."
 * V OCK to šlo vždycky (tlačítko „+ přidat trvalou položku do sekce" přímo
 * v tabulce ceníku), v projekci se trvalé položky zakládaly z kalkulace.
 * Tahle karta to místo dává i projekci: pro každou sekci nabídne seznam
 * trvalých položek a tlačítka na přidání hodinové a fixní.
 *
 * Zdroj pravdy je CENÍK varianty (`PC.vlastniPolozky`), stejně jako dřív;
 * změna se propíše do DEFAULT_CENIK_PROJ (aby ji dostala každá nová zakázka
 * v téhle relaci) a přes projKatalogAplikuj do otevřené kalkulace. */
function cenikProjTrvaleSekce() {
  const zdroj = (typeof PJ !== 'undefined' && PJ && Array.isArray(PJ.sekce)) ? PJ.sekce
    : ((typeof DEFAULT_ZADANI_PROJ !== 'undefined' && DEFAULT_ZADANI_PROJ.sekce) || []);
  return zdroj.map(s => ({ key: s.key, nazev: s.nazev }));
}
function cenikProjTrvaleRadky() {
  if (!jeAdmin() || typeof projKatalogSekce !== 'function') return '';
  /* Sekce projekce jdou ROVNOU V TABULCE ceníku, stejně jako sekce v ceníku OCK
   * (pokyn J. V. 1. 9. 2026: „přidávání položek do ceníku projekce proveď
   * stejně jako do ceníku OCK, tzn. tlačítky v jednotlivých sekcích a ne
   * v samostatné části"). Skupiny nahoře jsou sazby a fixní částky předlohy,
   * tyhle sekce jsou trvalé položky, které si firma přidala sama. */
  return cenikProjTrvaleSekce().map(sek => {
    const polozky = projKatalogSekce(PC, sek.key);
    const seznam = polozky.map(p => `<tr>
      <td class="c-nazev"><input type="text" class="nazev-ed" value="${esc(p.nazev)}"
        onchange="cenikProjTrvaleSet('${esc(sek.key)}','${esc(p.kid)}','nazev',this.value)">
        ${klicChip('PC.vlastniPolozky.' + sek.key + '.' + p.kid)}</td>
      <td class="c-hod">${p.typ === 'hod'
        ? `<input type="number" step="any" style="width:90px" value="${+p.hodiny || 0}"
             title="hodin" onchange="cenikProjTrvaleSet('${esc(sek.key)}','${esc(p.kid)}','hodiny',this.value)">`
        : `<input type="number" step="any" value="${+p.cena || 0}"
             onchange="cenikProjTrvaleSet('${esc(sek.key)}','${esc(p.kid)}','cena',this.value)">`}</td>
      <td class="c-jed">${p.typ === 'hod' ? 'hod (' + esc(p.sazba || 'projektant') + ')' : 'Kč'}</td>
      <td class="c-pozn">trvalá položka – je v každé nové nabídce
        <button class="mini noprint" title="odebrat trvalou položku z ceníku"
          onclick="cenikProjTrvaleDel('${esc(sek.key)}','${esc(p.kid)}')">✕</button></td></tr>`).join('');
    return `<tr class="sec"><td colspan="4">${esc(sek.nazev)}</td></tr>${seznam}
      <tr class="pridat noprint"><td colspan="4">
        <button class="mini" onclick="cenikProjTrvaleAdd('${esc(sek.key)}','hod')">+ přidat trvalou hodinovou položku</button>
        <button class="mini" onclick="cenikProjTrvaleAdd('${esc(sek.key)}','fix')">+ přidat trvalou fixní položku</button>
      </td></tr>`;
  }).join('');
}
function cenikProjTrvaleAdd(sekKey, typ) {
  if (!jeAdmin()) return;
  const it = projKatalogPridej(PC, sekKey, { typ: typ === 'hod' ? 'hod' : 'fix' });
  if (typeof DEFAULT_CENIK_PROJ !== 'undefined' && DEFAULT_CENIK_PROJ !== PC) {
    DEFAULT_CENIK_PROJ.vlastniSeq = Math.max(+DEFAULT_CENIK_PROJ.vlastniSeq || 0, +PC.vlastniSeq || 0);
    if (!projKatalogSekce(DEFAULT_CENIK_PROJ, sekKey).some(k => k.kid === it.kid))
      projKatalogSekce(DEFAULT_CENIK_PROJ, sekKey).push(JSON.parse(JSON.stringify(it)));
  }
  projKatalogAplikuj(PC, PJ);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function cenikProjTrvaleSet(sekKey, kid, klic, hodnota) {
  if (!jeAdmin()) return;
  [PC, (typeof DEFAULT_CENIK_PROJ !== 'undefined' ? DEFAULT_CENIK_PROJ : null)].forEach(cil => {
    if (!cil) return;
    const it = projKatalogSekce(cil, sekKey).find(k => k.kid === kid);
    if (!it) return;
    if (klic === 'nazev') it.nazev = String(hodnota);
    else it[klic] = +hodnota || 0;
  });
  /* A totéž v otevřené kalkulaci, ať se změna projeví hned. */
  (PJ.sekce || []).forEach(s => (s.polozky || []).forEach(p => {
    if (p.kid !== kid) return;
    if (klic === 'nazev') p.nazev = String(hodnota); else p[klic] = +hodnota || 0;
  }));
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
async function cenikProjTrvaleDel(sekKey, kid) {
  if (!jeAdmin()) return;
  const it = projKatalogSekce(PC, sekKey).find(k => k.kid === kid);
  if (!await potvrd('Odebrat trvalou položku „' + ((it && it.nazev) || '') + '" z ceníku projekce?\n\n'
    + 'Zmizí i z této zakázky a nebude součástí nových nabídek.')) return;
  projKatalogSmaz(PC, sekKey, kid);
  if (typeof DEFAULT_CENIK_PROJ !== 'undefined' && DEFAULT_CENIK_PROJ !== PC)
    projKatalogSmaz(DEFAULT_CENIK_PROJ, sekKey, kid);
  (PJ.sekce || []).forEach(s => {
    if (!Array.isArray(s.polozky)) return;
    s.polozky = s.polozky.filter(p => p.kid !== kid);
  });
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

async function resetCenik() {
  if (await potvrd('Vrátit ceny OCK na platný ceník programu?\n\nPřepíše se jen ceník této varianty, platná verze se nemění.')) {
    aktivniVarianta(ZAK).data.cenik = JSON.parse(JSON.stringify(DEFAULT_CENIK));
    syncVarianta(); render();
  }
}
async function resetCenikProj() {
  if (await potvrd('Vrátit ceny PROJ na platný ceník programu?\n\nPřepíše se jen ceník této varianty, platná verze se nemění.')) {
    aktivniVarianta(ZAK).data.proj.cenik = JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ));
    syncVarianta(); render();
  }
}

/* ---------- Excel export/import ceníku (OCK + PROJ) ---------- */
function cenikStav(t) { const el = document.getElementById('cenikStav'); if (el) el.textContent = t; }

function cenikExport() {
  try {
    const blob = xlsxZapis(cenikToSheets(C, PC));
    const cislo = (ZAK.cislo || '').replace(/\s+/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ('CENIK_' + (cislo || 'ENG') + '.xlsx').replace(/[\\/:*?"<>|]+/g, '-');
    a.click();
    cenikStav('Export hotový – soubor je ve Stažených. Uprav ceny (sloupec Hodnota) a nahraj zpět Importem.');
  } catch (e) { cenikStav('Chyba exportu: ' + e.message); }
}

let CENIK_IMPORT = null;   // {zmeny, chyby, nezname} čekající na potvrzení
function cenikImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    cenikStav('Načítám ' + f.name + '…');
    f.arrayBuffer().then(async buf => {
      try {
        const sheets = await xlsxPrecti(new Uint8Array(buf));
        CENIK_IMPORT = cenikDiffZeSheets(sheets, C, PC);
        cenikImportModal(CENIK_IMPORT);
      } catch (e) { cenikStav('Chyba importu: ' + e.message); }
    });
  };
  inp.click();
}

function cenikImportModal(res) {
  const kc = v => (typeof v === 'number' ? v.toLocaleString('cs-CZ') : String(v));
  const radky = res.zmeny.map(z =>
    `<tr><td>${esc(z.cesta)}</td><td>${esc(z.popis)}</td>
       <td style="text-align:right;color:#6b7686">${esc(kc(z.stara))}</td>
       <td style="text-align:right;font-weight:600">${esc(kc(z.nova))}</td></tr>`).join('');
  const chyby = res.chyby.length ? `<div class="neg" style="margin:8px 0">Chyby (${res.chyby.length}): ${res.chyby.map(esc).join('; ')}</div>` : '';
  const nezname = res.nezname.length ? `<div class="note">Ignorováno neznámých klíčů: ${res.nezname.length}.</div>` : '';
  const telo = res.zmeny.length
    ? `<div class="note">Zkontroluj ${res.zmeny.length} změn. Po potvrzení se zapíšou do ceníku aktivní varianty.</div>
       <table class="sd-tbl"><thead><tr><th>Klíč</th><th>Položka</th><th style="text-align:right">Původní</th><th style="text-align:right">Nová</th></tr></thead>
       <tbody>${radky}</tbody></table>`
    : '<div class="note">Žádné změny oproti aktuálnímu ceníku.</div>';
  const ov = document.getElementById('nastaveni-overlay');   // sdílený overlay pro modály
  const panel = document.getElementById('nastaveni-panel');
  panel.innerHTML = `<h2>Import ceníku z Excelu — přehled změn</h2>
    <div class="body">${chyby}${telo}${nezname}
      <div class="btns" style="margin-top:16px">
        ${res.zmeny.length ? '<button class="primary" onclick="cenikImportPotvrd()">Zapsat změny do ceníku</button>' : ''}
        <button onclick="zavriNastaveni()">Zavřít</button>
      </div></div>`;
  ov.style.display = 'flex';
}
function cenikImportPotvrd() {
  if (!CENIK_IMPORT) return;
  const n = cenikAplikuj(CENIK_IMPORT.zmeny, C, PC);
  CENIK_IMPORT = null;
  zavriNastaveni();
  syncVarianta(); render();
  cenikStav('Import hotový – zapsáno ' + n + ' změn do ceníku.');
}
