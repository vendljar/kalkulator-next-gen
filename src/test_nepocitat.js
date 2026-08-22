/* ============================================================
 * VYŘAZENÉ POLOŽKY KALKULACE OCK — sloupec „Výchozí" u všech řádků
 * (21. 8. 2026 večer, zadání J. V.: „přidej ke všem položkám kalkulace OCK
 * možnost zaškrtnout výchozí počítání").
 *
 * PROČ TAHLE SADA
 * Vyřazení položky MĚNÍ CENU. Je to jediné místo v aplikaci, kde nastavení
 * obrazovky sahá na výsledek výpočtu, takže se musí hlídat obojí:
 *   1) PRÁZDNÝ SEZNAM NESMÍ ZMĚNIT NIC. Model 1 je 1:1 s Excelem (zásada 8)
 *      a drtivá většina zakázek žádnou položku vyřazenou nemá — kdyby filtr
 *      i tak zasáhl do součtu, rozejdou se všechny historické nabídky.
 *   2) VYŘAZENÍ SE MUSÍ PROJEVIT V SOUČTU, ne jen v tabulce. Kdyby zmizel
 *      jen řádek a součet zůstal, byla by na obrazovce lež.
 *   3) MATICE NESE JEN ODCHYLKY a vtiskne se JEN do nové zakázky.
 * ============================================================ */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
const Zo = require('./zobrazeni.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
const zadani = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const cenik = () => ZC.zkusebniCenik();

/* ---------- 1) prázdný seznam nemění nic ---------- */

const zBez = zadani();
const rBez = eng.vypocet(zBez, cenik(), JEKLY, true);
test('výchozí zadání má prázdný seznam vyřazených',
  Array.isArray(zBez.nepocitat) && zBez.nepocitat.length === 0);
const zPrazdny = zadani(); zPrazdny.nepocitat = [];
test('prázdný seznam nezmění cenu ani o korunu',
  eng.vypocet(zPrazdny, cenik(), JEKLY, true).souhrn.zakladCena === rBez.souhrn.zakladCena);
const zChybi = zadani(); delete zChybi.nepocitat;
test('chybějící pole (starší zakázka) se chová stejně',
  eng.vypocet(zChybi, cenik(), JEKLY, true).souhrn.zakladCena === rBez.souhrn.zakladCena);

/* ---------- 2) vyřazení opravdu ubere ze součtu ---------- */

const prvni = rBez.sekce.hrubaOck[0];
test('sekce Hrubá OCK má z čeho vyřazovat', !!prvni, JSON.stringify(rBez.sekce.hrubaOck.length));
const zVyrazeno = zadani();
zVyrazeno.nepocitat = [prvni.origNazev || prvni.nazev];
const rVyrazeno = eng.vypocet(zVyrazeno, cenik(), JEKLY, true);
test('vyřazený řádek v tabulce není',
  rVyrazeno.sekce.hrubaOck.every(x => (x.origNazev || x.nazev) !== (prvni.origNazev || prvni.nazev)));
test('a jeho cena zmizela i ze součtu',
  rVyrazeno.souhrn.zakladCena < rBez.souhrn.zakladCena,
  rVyrazeno.souhrn.zakladCena + ' vs ' + rBez.souhrn.zakladCena);
/* Rezerva se počítá z nákladů sekcí, takže musí klesnout taky — kdyby se
 * počítala z původního čísla, vrátila by se vyřazená položka zadními vrátky. */
test('rezerva se přepočítá z menšího základu',
  rVyrazeno.rezerva.naklad <= rBez.rezerva.naklad);
test('neznámý název v seznamu nic nerozbije',
  eng.vypocet(Object.assign(zadani(), { nepocitat: ['TAKOVÁ POLOŽKA NEEXISTUJE'] }),
    cenik(), JEKLY, true).souhrn.zakladCena === rBez.souhrn.zakladCena);

/* Vyřadit jde i položku režie — přirážka za ATYP se pak počítá z toho,
 * co v režii zbylo (počítá se před filtrem, ale sčítá se až po něm). */
const rezijni = rBez.sekce.rezie[0];
if (rezijni) {
  const zR = zadani(); zR.nepocitat = [rezijni.origNazev || rezijni.nazev];
  const rR = eng.vypocet(zR, cenik(), JEKLY, true);
  test('vyřadit jde i položku režie',
    rR.sekce.rezie.length === rBez.sekce.rezie.length - 1
    && rR.souhrn.zakladCena < rBez.souhrn.zakladCena);
}

/* ---------- 3) cesta z obrazovky: matice → nová zakázka ---------- */

const klic = Zo.ZOBRAZENI_POCITAT + (prvni.origNazev || prvni.nazev);
let mat = {};
Zo.zobrazeniPolozkaVychoziNastav(mat, klic, false, true);
test('odškrtnutí se uloží do matice', mat.vychozi && mat.vychozi[klic] === false,
  JSON.stringify(mat.vychozi));
Zo.zobrazeniPolozkaVychoziNastav(mat, klic, true, true);
test('návrat na výchozí stav klíč z matice smaže', !mat.vychozi || mat.vychozi[klic] === undefined);

/* Název položky obsahuje tečky („PLECHY - OPLECH. DVEŘÍ…") — očista je nesmí
 * zahodit, jinak by se sloupec dal zaškrtat a nestalo by se nic. Přesně tahle
 * chyba už jednou u sloupce Výchozí byla (20. 8. 2026). */
const sTeckou = Zo.ZOBRAZENI_POCITAT + 'PLECHY - OPLECH. DVEŘÍ A PODEST (MATERIÁL)';
const matT = Zo.zobrazeniOciste({ vychozi: { [sTeckou]: false } });
test('klíč s tečkou v názvu očistu přežije', matT.vychozi && matT.vychozi[sTeckou] === false,
  JSON.stringify(matT.vychozi));

const nova = zadani();
const zmen = Zo.zobrazeniVychoziAplikuj({ vychozi: { [klic]: false } }, nova, null);
test('nová zakázka převezme vyřazení z matice',
  zmen > 0 && nova.nepocitat.length === 1 && nova.nepocitat[0] === (prvni.origNazev || prvni.nazev),
  JSON.stringify(nova.nepocitat));
test('a rovnou se to projeví na ceně',
  eng.vypocet(nova, cenik(), JEKLY, true).souhrn.zakladCena === rVyrazeno.souhrn.zakladCena);

/* Bez odchylky v matici zůstane nová zakázka prázdná — žádné pole navíc,
 * které by se pak muselo pracně čistit. */
const nova2 = zadani();
Zo.zobrazeniVychoziAplikuj({}, nova2, null);
test('bez odchylky se do nové zakázky nic nedopisuje', nova2.nepocitat.length === 0);

/* ---------- 4) totéž pro PŘÍPLATKY (sloupec Nabídka) ---------- */
/* Zadání J. V. 21. 8. 2026 večer: „přidej výchozí tlačítka i do sekce
 * Příplatkové položky." U příplatku Výchozí neřídí cenu, ale to, jestli
 * se propíše do cenové nabídky — v zadání je to `priplatkyVynechat`. */
const klicP = Zo.ZOBRAZENI_PRIPLATEK + 'vsgFolie';
let matP = {};
Zo.zobrazeniPolozkaVychoziNastav(matP, klicP, false, true);
test('odškrtnutý příplatek se uloží do matice', matP.vychozi && matP.vychozi[klicP] === false);
const novaP = zadani();
Zo.zobrazeniVychoziAplikuj(matP, novaP, null);
test('a nová zakázka ho má mezi vynechanými z nabídky',
  (novaP.priplatkyVynechat || []).indexOf('vsgFolie') >= 0, JSON.stringify(novaP.priplatkyVynechat));
test('vynechaný příplatek NEMĚNÍ cenu (jde jen o nabídku)',
  eng.vypocet(novaP, cenik(), JEKLY, true).souhrn.zakladCena === rBez.souhrn.zakladCena);
const novaP2 = zadani();
Zo.zobrazeniVychoziAplikuj({}, novaP2, null);
test('bez odchylky zůstane seznam vynechaných příplatků prázdný',
  (novaP2.priplatkyVynechat || []).length === 0);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
