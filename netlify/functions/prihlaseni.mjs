/* POST /api/prihlaseni { email, heslo } → HttpOnly cookie relace.
 * První přihlášení administrátora zakládá účet heslem z ADMIN_INIT_HESLO. */
import { uloziste, otiskHesla, hesloSedi, relaceVytvor, json, ADMIN_EMAIL } from '../lib/sdilene.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte POST.' }, 405);
  let email = '', heslo = '';
  try { const t = await req.json(); email = String(t.email || '').trim().toLowerCase(); heslo = String(t.heslo || ''); }
  catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }
  if (!email || !heslo) return json({ ok: false, chyba: 'Zadejte e-mail i heslo.' }, 400);

  const u = await uloziste('uzivatele');
  let ucet = await u.cti(email);

  /* bootstrap prvního administrátora — heslo si uživatel nastavil sám
   * v prostředí Netlify, nikdy neputovalo přes konverzaci */
  if (!ucet && email === ADMIN_EMAIL && process.env.ADMIN_INIT_HESLO
      && heslo === process.env.ADMIN_INIT_HESLO) {
    ucet = { email, jmeno: 'Jaroslav Vendl', role: 'Administrátor',
             heslo: otiskHesla(heslo), zalozen: new Date().toISOString(), aktivni: true };
    await u.zapis(email, ucet);
  }
  if (!ucet || ucet.aktivni === false || !hesloSedi(heslo, ucet.heslo))
    return json({ ok: false, chyba: 'Nesprávný e-mail nebo heslo.' }, 401);

  const cookie = 'relace=' + relaceVytvor(ucet.email, ucet.role)
    + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200';
  return json({ ok: true, email: ucet.email, jmeno: ucet.jmeno, role: ucet.role },
    200, { 'Set-Cookie': cookie });
};
export const config = { path: '/api/prihlaseni' };
