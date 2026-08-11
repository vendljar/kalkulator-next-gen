/* Mapa vlastních polí Pipedrive (9. 8. 2026, #16).
 *
 * GET /api/pd/pole            → { ok, nastaveno, mapa, popisy, chybi, nezarazeno, poridano }
 * GET /api/pd/pole?obnovit=1  → totéž, ale s vynuceným dotazem do Pipedrive
 *                               (jen Administrátor)
 *
 * Proč cache: seznam vlastních polí se mění jednou za rok, ale potřebuje ho
 * KAŽDÉ načtení dealu. Dotaz na seznam stojí 20 tokenů denního rozpočtu —
 * bez cache by pár desítek načtení denně ukrojilo znatelný kus limitu jen za
 * čtení něčeho, co se nemění. Platnost jeden den je kompromis: když se pole
 * v CRM přejmenuje, projeví se to nejpozději zítra a administrátor to umí
 * uspíšit přepínačem `obnovit`.
 *
 * Odpověď schválně NENESE token ani nic z prostředí — jen názvy polí a jejich
 * hashe, což je informace o tvaru CRM, ne o datech zakázek. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { pdNastaveno, pdZavolej, PdChyba, PD_TOKEN_PROMENNA, PD_DOMENA_PROMENNA } from '../lib/pipedrive.mjs';
import { pdMapaZPoli, POLE_DEALU, POLE_ORGANIZACE } from '../lib/pd_mapa.mjs';

const ULOZISTE = 'pipedrive';
const KLIC = 'pole';
export const PLATNOST_MS = 24 * 3600 * 1000;

/* Vrací hotovou mapu i ostatním funkcím (pd_dealy, pd_deal), aby si ji
 * nemusela každá skládat po svém — a hlavně aby cache byla jedna. */
export async function pdPoleMapa(obnovit = false) {
  const s = await uloziste(ULOZISTE);
  const ulozene = await s.cti(KLIC);
  if (!obnovit && ulozene && (Date.now() - (ulozene.poridano || 0)) < PLATNOST_MS)
    return ulozene;

  const [poleDealu, poleOrg] = await Promise.all([
    pdZavolej('/api/v2/dealFields', { dotaz: { limit: 500 } }),
    pdZavolej('/api/v2/organizationFields', { dotaz: { limit: 500 } }),
  ]);
  const deal = pdMapaZPoli(poleDealu, POLE_DEALU);
  const org = pdMapaZPoli(poleOrg, POLE_ORGANIZACE);
  const cerstve = {
    poridano: Date.now(),
    mapa: deal.mapa, popisy: deal.popisy, chybi: deal.chybi, nezarazeno: deal.nezarazeno,
    mapaOrganizace: org.mapa, popisyOrganizace: org.popisy, chybiOrganizace: org.chybi,
  };
  await s.zapis(KLIC, cerstve);
  return cerstve;
}

export default async (req) => {
  const { chyba, relace } = await vyzadujRoli(req);
  if (chyba) return chyba;

  if (!pdNastaveno())
    return json({ ok: true, nastaveno: false, mapa: {}, chybi: [], nezarazeno: [],
      chyba: 'Napojení na Pipedrive zatím není nastavené. Administrátor doplní '
        + PD_TOKEN_PROMENNA + ' a ' + PD_DOMENA_PROMENNA + ' v Netlify.' });

  const url = new URL(req.url);
  const obnovit = url.searchParams.get('obnovit') === '1';
  /* Obnovení stojí dotaz do Pipedrive, takže ho smí spustit jen správce —
   * jinak by stačilo držet prst na F5 a rozpočet je pryč. */
  if (obnovit && relace.role !== 'Administrátor')
    return json({ ok: false, chyba: 'Obnovit mapu polí smí jen administrátor.' }, 403);

  try {
    const m = await pdPoleMapa(obnovit);
    return json({ ok: true, nastaveno: true, ...m });
  } catch (e) {
    if (e instanceof PdChyba) return json({ ok: false, chyba: e.message }, e.stav >= 500 ? 502 : e.stav);
    throw e;
  }
};
export const config = { path: '/api/pd/pole' };
