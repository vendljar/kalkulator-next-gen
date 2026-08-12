/* Sdílený rejstřík žádostí o schválení slevy (#102, 10. 8. 2026).
 *
 * GET /api/schvalovani            → žádosti čekající na rozhodnutí
 * GET /api/schvalovani?vse=1      → i ty už rozhodnuté
 *
 * PROČ TO VZNIKLO
 * Záložka Schvalování slev do dneška ukazovala jen žádosti z právě otevřené
 * zakázky. Pro schvalovatele to znamenalo, že se musel nejdřív jinou cestou
 * dozvědět, že nějaká žádost vznikla, a teprve pak tu zakázku otevřít.
 * Dokud jsou zakázky dvě tři denně, je to únosné; jakmile jich je víc,
 * začne se na žádosti zapomínat — a zapomenutá žádost znamená nabídku,
 * která k zákazníkovi neodešla.
 *
 * CO SE V REJSTŘÍKU ZÁMĚRNĚ NEOBJEVÍ
 * Žádná částka. Ani cena, ani sleva v korunách, ani marže, ani nic z ceníku.
 * Rejstřík je seznam ROZHODNUTÍ K UDĚLÁNÍ, ne přehled obchodu — nese číslo
 * zakázky, název akce, procento slevy a stav. Kdo chce vidět peníze, otevře
 * si zakázku, kde platí obvyklá pravidla zobrazení (marži vidí jen ten, komu
 * ji administrátor přidělil). Kdyby rejstřík vozil částky, obcházel by tím
 * matici zobrazení jedním požadavkem — a to je přesně ten druh díry, kterou
 * nikdo nehledá, protože „je to jen přehled".
 *
 * KDO SE SMÍ PTÁT
 * Každý přihlášený. Rozhodnutí z 10. 8. 2026 zní, že všichni vidí všechny
 * zakázky (#103), a rejstřík navíc neobsahuje nic, co by nebylo vidět
 * v přehledu zakázek. Rozhodovat o žádosti je jiná věc — to hlídá strop role
 * v prohlížeči i při zápisu zakázky.
 */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';

/* Kolik zakázek se nanejvýš projde. Pojistka proti tomu, aby se z otevření
 * záložky stal dlouhý běh přes celou databázi — při 300 zakázkách je to
 * 300 čtení. Kdyby se strop někdy vyčerpal, odpověď to řekne nahlas
 * (`neuplny: true`) místo aby tiše zamlčela zbytek. */
export const STROP_ZAKAZEK = 500;

/* Ze zakázky vybere jen to, co patří do rejstříku. Vypisuje se jmenovitě,
 * ne kopií objektu slevy — kdyby se do slevy někdy přidalo pole s částkou,
 * takhle se do rejstříku nedostane samo. */
function zadostiZeZakazky(zak, klic) {
  const varianty = Array.isArray(zak && zak.varianty) ? zak.varianty : [];
  const out = [];
  for (const v of varianty) {
    /* Dvě slevy, dvě žádosti (#134, 12. 8. 2026): sleva na výtahovou šachtu
     * a sleva na projekční práce. Každá se počítá z ceny své kalkulace, takže
     * i v rejstříku stojí samostatně — vedoucí může jednu pustit a druhou ne. */
    for (const cast of ['ock', 'proj']) {
      const sl = v && v.data && (cast === 'proj' ? v.data.slevaProj : v.data.sleva);
      if (!sl || !(+sl.procenta > 0)) continue;
      out.push(zadost(zak, klic, v, sl, cast));
    }
  }
  return out;
}

/* Jeden záznam rejstříku. Vypisuje se jmenovitě, ne kopií objektu slevy —
 * kdyby se do slevy někdy přidalo pole s částkou, takhle se do rejstříku
 * nedostane samo. */
function zadost(zak, klic, v, sl, cast) {
  return {
      klic,
      cast,
      cislo: String((zak && zak.cislo) || ''),
      nazevAkce: String((zak && zak.nazevAkce) || ''),
      variantaId: v.id,
      variantaNazev: String(v.nazev || ''),
      ridici: !!v.ridici,
      zamceno: !!(v.zamek && v.zamek.zamceno),
      upraveno: String(v.upraveno || ''),
      sleva: {
        procenta: +sl.procenta || 0,
        role: String(sl.role || ''),
        schema: String(sl.schema || ''),
        poznamka: String(sl.poznamka || ''),
        stav: String(sl.stav || ''),
        schvalil: String(sl.schvalil || ''),
        schvalilKdy: String(sl.schvalilKdy || ''),
        schvalenoProc: sl.schvalenoProc == null ? null : +sl.schvalenoProc,
        zamitl: String(sl.zamitl || ''),
        zamitlKdy: String(sl.zamitlKdy || ''),
        zamitnutoProc: sl.zamitnutoProc == null ? null : +sl.zamitnutoProc,
        zamitnutoDuvod: String(sl.zamitnutoDuvod || ''),
      },
  };
}

export default async (req) => {
  const { chyba } = await vyzadujRoli(req);      // stačí být přihlášen
  if (chyba) return chyba;
  if (req.method !== 'GET') return json({ ok: false, chyba: 'Použijte GET.' }, 405);

  const vse = new URL(req.url).searchParams.get('vse') === '1';
  const s = await uloziste('zakazky');
  const klice = (await s.seznam('z/')) || [];
  const omezeno = klice.slice(0, STROP_ZAKAZEK);

  const zadosti = [];
  for (const k of omezeno) {
    let zak = null;
    /* Jedna poškozená zakázka nesmí shodit celý rejstřík — schvalovatel by
     * přišel o všechny ostatní žádosti kvůli jednomu rozbitému souboru. */
    try { zak = await s.cti(k); } catch (e) { zak = null; }
    if (!zak) continue;
    zadosti.push(...zadostiZeZakazky(zak, k.replace(/^z\//, '')));
  }

  const ceka = zadosti.filter(z => z.sleva.stav === 'čeká na schválení');
  return json({
    ok: true,
    zadosti: vse ? zadosti : ceka,
    pocetCeka: ceka.length,
    pocetCelkem: zadosti.length,
    prohledano: omezeno.length,
    neuplny: klice.length > omezeno.length,
  });
};
export const config = { path: '/api/schvalovani' };
