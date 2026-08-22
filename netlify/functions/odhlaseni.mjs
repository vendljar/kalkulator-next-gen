import { json } from '../lib/sdilene.mjs';
/* Odhlášení jen na POST (audit 22. 8. 2026, B17): odkaz z cizí stránky
 * (GET přes navigaci posílá cookie i se SameSite=Lax) by jinak uživatele
 * odhlásil. Nic víc to neumí, ale je to obtěžování zadarmo. */
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte POST.' }, 405);
  return json({ ok: true }, 200,
    { 'Set-Cookie': 'relace=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
};
export const config = { path: '/api/odhlaseni' };
