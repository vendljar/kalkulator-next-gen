/* GET /api/ja → kdo je přihlášen (pro obnovu stavu aplikace po načtení).
 * Jméno se dočítá z účtu: relace nese jen e-mail a roli, ale aplikace jménem
 * razítkuje zámky i protokol — po obnovení stránky nesmí spadnout na e-mail. */
/* Účet se dočítá přes vyzadujRoli, ne přes holé prihlaseny: jinak by vypnutý
 * účet sice nikam nesměl, ale aplikace by mu po obnovení stránky pořád hlásila
 * „přihlášen jako …" a on by teprve při první akci narazil na 401. Odpověď má
 * říkat pravdu hned. */
/* Od 5. 8. 2026 (#145) se vrací i profil obchodního technika — titul, funkce,
 * telefon a sken podpisu s razítkem. Aplikace jimi vyplňuje blok „Vypracoval"
 * v cenové nabídce, takže je musí mít hned po obnovení stránky; jinak by první
 * nabídka vygenerovaná po načtení odešla bez podpisu. */
/* `hlavni` říká prohlížeči, že jde o hlavní administrátorský účet — ten,
 * který nejde zbavit role ani vypnout. Adresa zůstává jen na serveru (#95). */
import { vyzadujRoli, json, podpisCti, ADMIN_EMAIL } from '../lib/sdilene.mjs';
export default async (req) => {
  const { chyba, relace, ucet } = await vyzadujRoli(req);
  if (chyba) return chyba;
  return json({ ok: true, email: relace.email, role: relace.role, jmeno: relace.jmeno || '',
    titul: relace.titul || '', funkce: relace.funkce || '', telefon: relace.telefon || '',
    hlavni: relace.email === ADMIN_EMAIL,
    podpis: await podpisCti(ucet.email) });
};
export const config = { path: '/api/ja' };
