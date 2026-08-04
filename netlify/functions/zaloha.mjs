/* GET /api/zaloha — kompletní JSON otisk online databáze (program + zakázky
 * + uživatelé bez otisků hesel). Jen Administrátor. Tohle je zdroj pro
 * „odlévání" na Disk Google: aplikace nabídne uložení souboru rovnou do
 * připojené složky na Disku (File System Access), takže záloha končí tam,
 * kde ji chce uživatel mít — verzovaná jménem s datem. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';

export default async (req) => {
  const { chyba } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  const sProg = await uloziste('program');
  const prog = await sProg.cti('db');
  /* Firemní údaje jsou od 4. 8. 2026 taky online (obchodník složku nemapuje),
   * takže patří do zálohy stejně jako ceník — jinak by se po obnově vrátila
   * ukázková firma ze sestavení. */
  const firma = await sProg.cti('firma');
  const zak = await uloziste('zakazky');
  const klice = await zak.seznam('z/');
  const zakazky = {};
  for (const k of klice) zakazky[k.slice(2)] = await zak.cti(k);
  const rejstrik = await zak.cti('_rejstrik');
  const uziv = await uloziste('uzivatele');
  const uzivatele = [];
  for (const k of await uziv.seznam()) {
    const x = await uziv.cti(k);
    if (x) uzivatele.push({ email: x.email, jmeno: x.jmeno, role: x.role, aktivni: x.aktivni !== false });
  }
  return json({ ok: true, zaloha: {
    porizena: new Date().toISOString(), zdroj: 'schaftscalc.netlify.app',
    program: prog || null, firma: firma || null,
    rejstrik: rejstrik || null, zakazky, uzivatele } });
};
export const config = { path: '/api/zaloha' };
