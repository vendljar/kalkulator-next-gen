/* ============================================================
 * PRÁVA V PROHLÍŽEČI – kdo smí vidět pohled administrátora
 *
 * Skutečná práva hlídá server (netlify/lib/sdilene.mjs a funkce nad ním);
 * upravenému klientovi žádná role v prohlížeči nepomůže. Tenhle soubor
 * řeší jinou věc: co se komu ZOBRAZÍ. Ceníkové záložky a náklady se
 * skrývají podle `NAST.jeAdmin`, a do 5. 8. 2026 si tenhle příznak mohl
 * kdokoli přepnout sám — v horní liště na to bylo tlačítko.
 *
 * Pravidlo je proto jediné a drží ho `pravaSmiAdmin()`:
 *
 *   Je někdo přihlášený? Pak rozhoduje role, kterou vrátil server.
 *   Není nikdo přihlášený? Pak jde o záložní offline soubor a přepínač
 *   náhledu zůstává, jak byl — jinak by se v záložní variantě nikdo
 *   nedostal ani ke svému ceníku.
 *
 * Ve výchozím stavu odpovídá „ne". Neznámá role, překlep i prázdná
 * hodnota tedy končí u pohledu běžného uživatele, ne u administrátora.
 * ============================================================ */

const PRAVA_ADMIN = 'Administrátor';

/* `ja` je `ONLINE_STAV.ja`, tedy to, co o přihlášeném vrátil server:
 * { email, jmeno, role }. `null` znamená „nikdo přihlášen". */
function pravaSmiAdmin(ja) {
  if (ja === null || ja === undefined) return true;   // offline záloha
  if (typeof ja !== 'object') return false;           // nesmysl na vstupu
  return ja.role === PRAVA_ADMIN;
}

if (typeof module !== 'undefined')
  module.exports = { PRAVA_ADMIN, pravaSmiAdmin };
