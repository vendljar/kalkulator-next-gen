/* Test – kdo si smí v prohlížeči zapnout pohled administrátora
 *
 * Nález z 5. 8. 2026 (při přípravě příručky obchodníka): na snímku
 * „červená lišta" svítilo v horní liště oranžové tlačítko
 * „← Ukončit náhled uživatele" — a to u účtu Petra Nováka, tedy
 * obchodníka. Tlačítko volá `nastSetAdmin(true)`, což je jediná
 * podmínka, kterou `jeAdmin()` v klientu zná.
 *
 * Historie: přepínač Administrátor / Běžný uživatel je z doby, kdy
 * aplikace běžela jako jeden soubor na disku a žádné přihlášení
 * neexistovala — role byla jen náhled pro toho, kdo si aplikaci otevřel.
 * Od 4. 8. 2026 role přichází ze serveru (`online_ui.js`: NAST.jeAdmin =
 * ja.role === 'Administrátor'), ale tlačítko zůstalo viditelné každému,
 * kdo má `body.role-user` — tedy přesně těm, kterým to bylo zapovězeno.
 *
 * Co by tím obchodník získal: záložky Ceník OCK a Ceník projekce
 * (`tabViditelny()` je skrývá jen podle NAST.jeAdmin) a v Nastavení
 * přepínač „zobrazit náklady". Data už má prohlížeč stažená z online
 * databáze, protože z nich počítá — jen je nemá ukazovat. To je přesně
 * to, co ven nesmí: „Co se nesmí dostat ven jsou náklady a ceníky."
 *
 * Server tím nic neztrácí (zveřejnění ceníku, účty i zálohy si hlídá
 * sám), takže to není díra do databáze — je to díra do zobrazení
 * nákladů. Řeší se jedním pravidlem, které si tady drží testy:
 * pohled administrátora si smí zapnout jen ten, komu ho přiznal server. */
const { PRAVA_ADMIN, pravaSmiAdmin } = require('./prava.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- 1) přihlášený uživatel: rozhoduje role ze serveru ---------- */

test('administrátor si pohled administrátora zapnout smí',
  pravaSmiAdmin({ email: 'a@b.cz', role: PRAVA_ADMIN }) === true);
test('obchodník nesmí', pravaSmiAdmin({ email: 'o@b.cz', role: 'Obchodník' }) === false);
test('vedoucí nesmí', pravaSmiAdmin({ email: 'v@b.cz', role: 'Vedoucí' }) === false);

/* Role je řetězec ze serveru; překlep, prázdno ani cizí hodnota nesmí
 * skončit povolením — výchozí odpověď je „ne". */
test('neznámá role nesmí', pravaSmiAdmin({ role: 'Správce' }) === false);
test('prázdná role nesmí', pravaSmiAdmin({ role: '' }) === false);
test('chybějící role nesmí', pravaSmiAdmin({ email: 'x@b.cz' }) === false);
test('role se nepoznává podle velikosti písmen ani bez diakritiky',
  pravaSmiAdmin({ role: 'administrator' }) === false);

/* ---------- 2) nikdo přihlášen = záložní offline režim ---------- */

/* Kalkulačka poběží vždycky online; offline soubor je jen záloha pro
 * případ výpadku a otevírá ho ten, kdo ho má na disku. Tam žádný server
 * roli neurčuje, a přepínač náhledu tam dává smysl dál — jinak by si
 * v záložní variantě nikdo neotevřel ani ceník. */
test('bez přihlášení (offline záloha) přepínač zůstává', pravaSmiAdmin(null) === true);
test('bez přihlášení – undefined se chová stejně', pravaSmiAdmin(undefined) === true);

/* ---------- 3) funkce nesmí spadnout ---------- */

/* Ptá se na ni `render()`, který běží při každé překreslení stránky.
 * Výjimka by shodila celou aplikaci, ne jen tlačítko. */
test('nesmysl na vstupu funkci neshodí', pravaSmiAdmin('Administrátor') === false);
test('číslo na vstupu funkci neshodí', pravaSmiAdmin(7) === false);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
