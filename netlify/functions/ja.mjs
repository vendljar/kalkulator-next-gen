/* GET /api/ja → kdo je přihlášen (pro obnovu stavu aplikace po načtení).
 * Jméno se dočítá z účtu: relace nese jen e-mail a roli, ale aplikace jménem
 * razítkuje zámky i protokol — po obnovení stránky nesmí spadnout na e-mail. */
/* Účet se dočítá přes vyzadujRoli, ne přes holé prihlaseny: jinak by vypnutý
 * účet sice nikam nesměl, ale aplikace by mu po obnovení stránky pořád hlásila
 * „přihlášen jako …" a on by teprve při první akci narazil na 401. Odpověď má
 * říkat pravdu hned. */
import { vyzadujRoli, json } from '../lib/sdilene.mjs';
export default async (req) => {
  const { chyba, relace } = await vyzadujRoli(req);
  if (chyba) return chyba;
  return json({ ok: true, email: relace.email, role: relace.role, jmeno: relace.jmeno || '' });
};
export const config = { path: '/api/ja' };
