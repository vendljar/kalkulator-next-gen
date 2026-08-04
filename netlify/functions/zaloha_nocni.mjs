/* NOČNÍ OTISK DATABÁZE (plánovaná funkce, běží každou noc ve 2:00 UTC).
 *
 * Proč vedle „odlévání" na Disk Google ještě tohle: záloha na Disk vzniká
 * jen tehdy, když se administrátor přihlásí v prohlížeči. Kdyby se týden
 * nikdo nepřihlásil a mezitím se něco pokazilo, chyběla by záloha úplně.
 * Noční otisk se pořizuje sám, bez lidí, a leží PŘÍMO v Netlify Blobs
 * (úložiště `zalohy`, klíč = datum). Odtud se dá obnovit i stav ke
 * konkrétnímu dni.
 *
 * Na rozdíl od zálohy pro Disk (soubor opouští systém, otisky hesel se
 * do něj nedávají) tenhle otisk zůstává ve stejném úložišti jako ostrá
 * data — uživatelé se proto ukládají CELÍ včetně otisků hesel, aby šla
 * databáze obnovit bez resetování všech hesel. Otisk hesla není heslo
 * (scrypt se solí); ven z Blobs se nikdy nedostane.
 *
 * Klíčů neubývá (jeden za den ≈ 365 za rok, každý pár set kB) — mazání
 * starých by byla další příležitost k chybě za pár ušetřených megabajtů. */
import { uloziste } from '../lib/sdilene.mjs';

export default async () => {
  const den = new Date().toISOString().slice(0, 10);

  const sProg = await uloziste('program');
  const prog = await sProg.cti('db');
  const firma = await sProg.cti('firma');   // od 4. 8. 2026 online (viz functions/firma.mjs)
  const zak = await uloziste('zakazky');
  const zakazky = {};
  for (const k of await zak.seznam('z/')) zakazky[k.slice(2)] = await zak.cti(k);
  const rejstrik = await zak.cti('_rejstrik');
  const uziv = await uloziste('uzivatele');
  const uzivatele = [];
  for (const k of await uziv.seznam()) {
    const x = await uziv.cti(k);
    if (x) uzivatele.push(x);            // celé účty včetně otisků hesel (viz výše)
  }

  await (await uloziste('zalohy')).zapis(den, {
    porizena: new Date().toISOString(), zdroj: 'nocni-otisk',
    program: prog || null, firma: firma || null,
    rejstrik: rejstrik || null, zakazky, uzivatele,
  });
  return new Response(JSON.stringify({ ok: true, den }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
export const config = { schedule: '0 2 * * *' };
