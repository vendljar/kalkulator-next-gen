/* GET /api/ja → kdo je přihlášen (pro obnovu stavu aplikace po načtení).
 * Jméno se dočítá z účtu: relace nese jen e-mail a roli, ale aplikace jménem
 * razítkuje zámky i protokol — po obnovení stránky nesmí spadnout na e-mail. */
import { prihlaseny, uloziste, json } from '../lib/sdilene.mjs';
export default async (req) => {
  const r = await prihlaseny(req);
  if (!r) return json({ ok: false, chyba: 'Nepřihlášen.' }, 401);
  const ucet = await (await uloziste('uzivatele')).cti(r.email);
  return json({ ok: true, email: r.email, role: r.role, jmeno: (ucet && ucet.jmeno) || '' });
};
export const config = { path: '/api/ja' };
