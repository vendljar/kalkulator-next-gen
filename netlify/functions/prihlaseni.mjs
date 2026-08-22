/* POST /api/prihlaseni { email, heslo } → HttpOnly cookie relace.
 * První přihlášení administrátora zakládá účet heslem z ADMIN_INIT_HESLO.
 *
 * Od 9. 8. 2026 tudy vedou dvě opatření z bezpečnostního auditu:
 *   #92 — brzda proti hádání hesel (počítadlo neúspěchů, zpoždění, 429).
 *         NIKDY nebrání správnému heslu; podrobnosti v lib/sdilene.mjs.
 *   #93 — u neznámého e-mailu se počítá scrypt proti zástupnému otisku,
 *         aby se z času odpovědi nedalo přečíst, které adresy existují.
 */
import { uloziste, otiskHesla, hesloSedi, relaceCookie, json, ADMIN_EMAIL,
         profilZUctu, podpisCti, FALESNY_OTISK, POKUSY_MAX, POKUSY_IP_MAX,
         zpozdeniMs, pockej, pokusyZacatek, pokusyUspech, adresaKlienta } from '../lib/sdilene.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte POST.' }, 405);
  let email = '', heslo = '';
  try { const t = await req.json(); email = String(t.email || '').trim().toLowerCase(); heslo = String(t.heslo || ''); }
  catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }
  if (!email || !heslo) return json({ ok: false, chyba: 'Zadejte e-mail i heslo.' }, 400);

  /* Pokus se započítá HNED — dřív než se cokoli ověřuje (B4, 22. 8. 2026).
   * Čekání podle počítadla běží také před ověřením, aby souběžné požadavky
   * platily stejně jako ty popořadě. Správné heslo počítadla vynuluje. */
  const ip = adresaKlienta(req);
  const pokusy = await pokusyZacatek(email, ip);
  await pockej(Math.max(zpozdeniMs(pokusy.email.n), pokusy.adresa.n > POKUSY_IP_MAX ? 2000 : 0));

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

  /* Heslo se ověřuje jako PRVNÍ a vždycky — i u neznámého účtu (proti
   * zástupnému otisku) a i tehdy, když je počítadlo neúspěchů přeplněné.
   * Kdyby brzda předběhla ověření, stačilo by nasypat deset špatných hesel
   * a majitel účtu by se nedostal dovnitř ani se správným. */
  const sedi = hesloSedi(heslo, (ucet && ucet.heslo) ? ucet.heslo : FALESNY_OTISK);
  const pustit = !!ucet && ucet.aktivni !== false && sedi;

  if (pustit) {
    await pokusyUspech(email, ip);
    const cookie = relaceCookie(ucet);                    // nese verzi hesla (B6)
    /* Profil se vrací rovnou při přihlášení (#145): aplikace jím vyplňuje blok
     * „Vypracoval" v cenové nabídce. Kdyby si ho musela dotahovat zvlášť, první
     * nabídka udělaná hned po přihlášení by odešla bez podpisu a bez telefonu. */
    return json({ ok: true, ...profilZUctu(ucet), hlavni: ucet.email === ADMIN_EMAIL,
      podpis: await podpisCti(ucet.email) }, 200, { 'Set-Cookie': cookie });
  }

  if (pokusy.email.n > POKUSY_MAX || pokusy.adresa.n > POKUSY_IP_MAX)
    return json({ ok: false, chyba: 'Příliš mnoho neúspěšných pokusů. Zkuste to za '
      + 'několik minut znovu, nebo se ozvěte správci.' }, 429);
  return json({ ok: false, chyba: 'Nesprávný e-mail nebo heslo.' }, 401);
};
export const config = { path: '/api/prihlaseni' };
