/* ============================================================
 * SKUTEČNÁ DATA PRO TESTY SHODY S EXCELEM (#43)
 *
 * Dvě sady – test.js (OCK) a test_proj.js (projekce) – neověřují logiku,
 * ale SHODU S PŘEDLOHOU: že se výsledek kalkulace nerozejde s excelovým
 * vzorem. Takový test má smysl jen se skutečnými cenami; s ukázkovými by
 * ověřoval, že vymyšlená čísla dávají vymyšlená čísla.
 *
 * Skutečné ceny ale v repozitáři nejsou a nikdy nebudou – to je celý smysl
 * očištění programu před nahráním na GitHub. Leží mimo repozitář:
 *
 *   1) ../_soukrome/cenik_skutecny.json      (pracovní kopie u vývoje)
 *   2) ./test_data/cenik_skutecny.json       (složka je v .gitignore)
 *
 * Když soubor není k dispozici, sada se PŘESKOČÍ (návratový kód 3) místo
 * aby selhala. Selhání by znamenalo „něco je rozbité"; tady jde o to, že
 * někdo bez přístupu k cenám prostě tuhle jednu kontrolu spustit nemůže –
 * a nemá kvůli tomu vidět červené testy u kódu, kterého se nedotkl.
 * spust_testy.sh kód 3 pozná a vypíše „přeskočeno".
 *
 * Formát souboru: { "cenik": {…}, "cenikProj": {…}, "slevy": {…} }
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const MISTA = [
  path.join(__dirname, '..', '_soukrome', 'cenik_skutecny.json'),
  path.join(__dirname, 'test_data', 'cenik_skutecny.json'),
];

const KOD_PRESKOCENO = 3;

/* Vrací { data, soubor } nebo null. Rozbitý JSON hlásí nahlas – to už je
 * chyba, ne chybějící soubor, a tichým přeskočením by se schovala. */
function skutecnaData() {
  for (const p of MISTA) {
    if (!fs.existsSync(p)) continue;
    try {
      return { data: JSON.parse(fs.readFileSync(p, 'utf8')), soubor: p };
    } catch (e) {
      console.error('CHYBA: ' + p + ' se nedá přečíst jako JSON – ' + e.message);
      process.exit(1);
    }
  }
  return null;
}

/* Použití na začátku sady:
 *     const { cenik } = vyzadujSkutecnaData('test.js', 'cenik');
 * Když data nejsou, funkce se nevrátí – proces skončí kódem 3. */
function vyzadujSkutecnaData(sada, ...klice) {
  const n = skutecnaData();
  if (!n) {
    console.log('PŘESKOČENO – ' + sada + ' ověřuje shodu s excelovou předlohou');
    console.log('a k tomu potřebuje skutečný ceník, který v repozitáři záměrně není.');
    console.log('Hledal jsem ho tady:');
    MISTA.forEach(p => console.log('  ' + p));
    console.log('Máte-li k cenám přístup, nakopírujte soubor na jedno z těch míst.');
    console.log('Ostatní sady běží dál – ty ukázková data nepotřebují.');
    process.exit(KOD_PRESKOCENO);
  }
  const chybi = klice.filter(k => !n.data[k]);
  if (chybi.length) {
    console.error('CHYBA: v ' + n.soubor + ' chybí klíč(e): ' + chybi.join(', '));
    process.exit(1);
  }
  const out = { _soubor: n.soubor };
  klice.forEach(k => { out[k] = JSON.parse(JSON.stringify(n.data[k])); });
  return out;
}

module.exports = { skutecnaData, vyzadujSkutecnaData, MISTA, KOD_PRESKOCENO };
