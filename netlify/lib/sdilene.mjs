/* ============================================================
 * SDÍLENÝ ZÁKLAD SERVEROVÝCH FUNKCÍ (online databáze, 4. 8. 2026)
 *
 * Úložiště: Netlify Blobs (trvalé, per-site). Pro lokální testy v Node
 * se použije zásuvná náhrada (globalThis.__TEST_ULOZISTE) — stejné API.
 *
 * Přihlášení: e-mail + heslo. Hesla se ukládají VÝHRADNĚ jako scrypt otisk
 * (sůl + hash, vestavěné node:crypto — žádné závislosti). Relace je podepsaná
 * HMAC kódem (TAJEMSTVI_RELACE z prostředí Netlify) v HttpOnly cookie.
 * Reset hesla provádí administrátor (rozhodnutí 3. 8. 2026) — žádný e-mail.
 *
 * První administrátor: adresa je níž v konstantě ADMIN_EMAIL a NIKDE JINDE
 * (rozhodnutí 3. 8. 2026, jedno místo od 9. 8. 2026 — #95).
 * Účet vznikne prvním přihlášením s heslem z proměnné ADMIN_INIT_HESLO,
 * kterou si uživatel nastaví v Netlify (heslo nikdy neputuje přes konverzaci
 * ani repozitář); po založení účtu lze proměnnou smazat.
 * ============================================================ */
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const ADMIN_EMAIL = 'vendl.jaroslav@engineers-cz.cz';
export const ROLE = ['Obchodník', 'Vedoucí', 'Administrátor'];

/* ---------- úložiště ---------- */
export async function uloziste(nazev) {
  if (globalThis.__TEST_ULOZISTE) return globalThis.__TEST_ULOZISTE(nazev);
  const { getStore } = await import('@netlify/blobs');
  /* consistency: 'strong' je NUTNÉ. Výchozí režim Blobs je „eventual" —
   * čtení hned po zápisu smí vrátit starý stav. V praxi (4. 8. 2026 večer):
   * administrátor založil účet, seznam načtený hned nato ho nenesl a
   * v obrazovce to vypadalo, že se účet nezaložil. Silná konzistence
   * platí pro všechna úložiště: účty, ceník, zakázky i zálohy. */
  const s = getStore({ name: nazev, consistency: 'strong' });
  return {
    async cti(klic) { return await s.get(klic, { type: 'json' }); },
    async zapis(klic, hodnota) { await s.setJSON(klic, hodnota); },
    async seznam(prefix) {
      const { blobs } = await s.list(prefix ? { prefix } : {});
      return blobs.map(b => b.key);
    },
  };
}

/* ---------- hesla (scrypt) ---------- */
export function otiskHesla(heslo) {
  const sul = randomBytes(16).toString('hex');
  const hash = scryptSync(String(heslo), sul, 64).toString('hex');
  return sul + ':' + hash;
}
export function hesloSedi(heslo, ulozene) {
  try {
    const [sul, hash] = String(ulozene).split(':');
    const b = scryptSync(String(heslo), sul, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), b);
  } catch (e) { return false; }
}

/* ---------- zástupný otisk pro neexistující účty (#93, 9. 8. 2026) ----------
 *
 * Hláška „Nesprávný e-mail nebo heslo." schválně neříká, co z toho bylo
 * špatně. Prozradil to ale ČAS odpovědi: u neznámé adresy se scrypt vůbec
 * nepočítal a odpověď přišla o desítky milisekund dřív než u existujícího
 * účtu se špatným heslem. Kdo měří, přečte si z toho seznam našich adres.
 *
 * Proti tomu se u neznámého účtu počítá scrypt proti tomuhle zástupnému
 * otisku. Výsledek se zahodí — jde jen o to, aby obě větve stály stejně
 * práce. Otisk vzniká z náhodných dat při startu funkce, takže se proti
 * němu nedá nic „uhodnout". */
export const FALESNY_OTISK = otiskHesla(randomBytes(24).toString('hex'));

/* ---------- brzda proti hádání hesel (#92, 9. 8. 2026) ----------
 *
 * Zamknout účet po N pokusech je zbraň, kterou lze obrátit proti majiteli:
 * stačí, aby někdo cizí zkoušel hesla k účtu administrátora, a ten se ten
 * den nepřihlásí vůbec — a není nikdo, kdo by mu účet odemkl.
 *
 * Proto brzda nikdy nebrání SPRÁVNÉMU heslu. Heslo se ověřuje vždycky jako
 * první a když sedí, uživatel jde dovnitř bez ohledu na počítadlo (a
 * počítadlo se přitom vynuluje). Zdržují a odmítají se jen špatná hesla:
 * od třetího neúspěchu roste zpoždění odpovědi, po desátém se další pokusy
 * odmítají s 429 po dobu okna. Útočník tím ztratí rychlost, majitel nic.
 *
 * Počítadlo je vedené na e-mail — i na takový, který v databázi není.
 * Kdyby se počítaly jen existující účty, prozradila by brzda sama, které
 * adresy u nás jsou (a zahodila by tím opravu #93). */
export const POKUSY_ULOZISTE = 'pokusy';
export const POKUSY_MAX = 10;
export const POKUSY_OKNO_MS = 15 * 60 * 1000;

/* Zpoždění v milisekundách podle počtu neúspěchů za sebou. Do dvou pokusů
 * se nečeká vůbec — překlep v hesle je běžná věc a trestat ho čekáním by
 * jen otravovalo. Strop dvě vteřiny je kompromis: hádání zpomalí na
 * nepoužitelnou míru, a přitom se funkce nevejde do časového limitu. */
export function zpozdeniMs(neuspechu) {
  if (!(neuspechu > 2)) return 0;
  return Math.min((neuspechu - 2) * 250, 2000);
}

/* V testech se nečeká — sada by jinak běžela o minuty déle. Že se na
 * zpoždění opravdu čeká, hlídá statická kontrola v test_prava.mjs. */
export function pockej(ms) {
  if (!ms || globalThis.__TEST_ULOZISTE) return Promise.resolve();
  return new Promise((hotovo) => setTimeout(hotovo, ms));
}

function pokusyKlic(email) { return String(email || '').trim().toLowerCase(); }

export async function pokusyStav(email) {
  const s = await uloziste(POKUSY_ULOZISTE);
  const z = await s.cti(pokusyKlic(email));
  /* Po uplynutí okna se počítadlo zapomíná. Bez toho by se neúspěchy
   * sčítaly napříč měsíci a člověk, který si jednou za čas splete heslo,
   * by se jednoho dne bez příčiny nepřihlásil. */
  if (!z || (Date.now() - (z.posledni || 0)) > POKUSY_OKNO_MS) return { n: 0, posledni: 0 };
  return { n: z.n || 0, posledni: z.posledni || 0 };
}

export async function pokusyNeuspech(email) {
  const s = await uloziste(POKUSY_ULOZISTE);
  const z = { n: (await pokusyStav(email)).n + 1, posledni: Date.now() };
  await s.zapis(pokusyKlic(email), z);
  return z;
}

export async function pokusyReset(email) {
  const s = await uloziste(POKUSY_ULOZISTE);
  await s.zapis(pokusyKlic(email), { n: 0, posledni: 0 });
}

/* ---------- relace (HMAC cookie) ---------- */
function tajemstvi() {
  const t = process.env.TAJEMSTVI_RELACE;
  if (!t || t.length < 16)
    throw new Error('Chybí proměnná prostředí TAJEMSTVI_RELACE (min. 16 znaků). '
      + 'Nastav ji v Netlify: Site configuration → Environment variables.');
  return t;
}
function podpis(data) { return createHmac('sha256', tajemstvi()).update(data).digest('base64url'); }

export function relaceVytvor(email, role) {
  const telo = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + 12 * 3600 * 1000 }))
    .toString('base64url');
  return telo + '.' + podpis(telo);
}
export function relaceOver(cookieHlavicka) {
  const m = /(?:^|;\s*)relace=([^;]+)/.exec(cookieHlavicka || '');
  if (!m) return null;
  const [telo, pod] = m[1].split('.');
  if (!telo || !pod || podpis(telo) !== pod) return null;
  try {
    const r = JSON.parse(Buffer.from(telo, 'base64url').toString());
    return (r.exp > Date.now()) ? r : null;
  } catch (e) { return null; }
}

/* ---------- pomůcky pro funkce ---------- */
export function json(data, status = 200, hlavicky = {}) {
  return new Response(JSON.stringify(data), { status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...hlavicky } });
}
export async function prihlaseny(req) {
  return relaceOver(req.headers.get('cookie'));
}

/* ---------- profil obchodního technika (5. 8. 2026, #145) ----------
 *
 * Účet nese vedle přihlašovacích údajů i to, čím se podepisuje pod cenovou
 * nabídkou: titul před jménem, funkci, telefon a sken podpisu s razítkem.
 * Do šablony pak jde ten, kdo nabídku opravdu dělal, a ne jméno kolegy
 * zapečené v dokumentu.
 *
 * `profilZUctu` je jediné místo, kde se rozhoduje, co o účtu smí ven.
 * Kdyby si každá funkce skládala odpověď po svém, dřív nebo později by
 * jedna z nich poslala do prohlížeče i `heslo` (scrypt otisk). Takhle
 * se vypisují políčka jmenovitě a nic navíc neprojde. */
export function profilZUctu(ucet) {
  const u = ucet || {};
  return {
    email: u.email || '',
    jmeno: u.jmeno || '',
    titul: u.titul || '',
    funkce: u.funkce || '',
    telefon: u.telefon || '',
    role: u.role || '',
  };
}

/* Podpis se ukládá stranou účtu (úložiště „podpisy"), ne do záznamu účtu.
 * Sken bývá pár set kilobajtů; kdyby seděl v účtu, tahal by se s ním při
 * KAŽDÉM požadavku (vyzadujRoli čte účet pokaždé) a seznam kolegů pro
 * administrátora by z pár řádků tabulky narostl na megabajty. */
export const PODPIS_ULOZISTE = 'podpisy';

/* Strop na velikost. 900 000 znaků zápisu base64 je zhruba 660 kB obrázku —
 * na sken podpisu a razítka bohatě stačí a Blobs ani Word to netrápí.
 * Bez stropu by stačilo nahrát fotku z mobilu a v každé nabídce by se
 * vozilo několik megabajtů. */
export const PODPIS_MAX = 900000;

/* Přijímá se JEN datový zápis PNG nebo JPEG.
 *
 * Proč ne SVG: vypadá to jako obrázek, ale je to XML, které umí nést skript.
 * Podpis zobrazujeme v aplikaci a chystáme se ho vkládat do .docx — formát,
 * který může něco spustit, do téhle cesty nepatří. Word ho ve výsledku
 * stejně neumí vložit jako obrázek.
 *
 * Proč ne odkaz (https://…): dokument musí být soběstačný. Nabídka putuje
 * e-mailem zákazníkovi; obrázek stažený z internetu by se u něj nemusel
 * zobrazit vůbec, a přitom by prozradil, kdy si nabídku otevřel. */
export function podpisZkontroluj(obrazek) {
  const s = String(obrazek == null ? '' : obrazek).trim();
  if (!s) return { ok: true, obrazek: '' };          // prázdno = podpis odebrat
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return { ok: false,
    chyba: 'Podpis musí být obrázek PNG nebo JPEG nahraný ze souboru. '
         + 'Odkaz na obrázek ani formát SVG přijmout nejde.' };
  if (s.length > PODPIS_MAX) return { ok: false,
    chyba: 'Obrázek je příliš velký (' + Math.round(s.length / 1024) + ' kB). '
         + 'Zmenšete ho zhruba pod 600 kB — na podpis s razítkem to stačí.' };
  return { ok: true, obrazek: s };
}

export async function podpisCti(email) {
  try {
    const z = await (await uloziste(PODPIS_ULOZISTE)).cti(String(email || '').toLowerCase());
    return (z && z.obrazek) || '';
  } catch (e) { return ''; }
}

/* Ověření, kdo požadavek posílá a jestli na něj má právo.
 *
 * PROČ SE ÚČET DOČÍTÁ Z DATABÁZE A NEVĚŘÍ SE COOKIE (rozhodnutí 5. 8. 2026,
 * bezpečnostní audit). Relace je podepsaná cookie s platností 12 hodin a nese
 * v sobě roli. Dokud se role četla z ní, platilo tohle: administrátor, kterému
 * se v poledne role sníží na obchodníka, si až do večera dál stahoval celou
 * zálohu databáze a zveřejňoval ceníky; vypnutý účet — kolega, který odchází
 * z firmy — pracoval dál, protože cookie v jeho prohlížeči nikdo neodebral.
 * Přesně ve chvíli, kdy na právech záleží nejvíc, tedy nedržela.
 *
 * Teď se při každém požadavku načte účet z úložiště a rozhoduje jeho DNEŠNÍ
 * stav: neexistuje-li nebo je vypnutý, je to 401 (ať se přihlásí znovu a uvidí
 * proč), a roli určuje účet, ne cookie. Povýšení tím platí okamžitě, bez
 * odhlášení. Cena je jedno čtení z Blobs navíc na požadavek — proti riziku,
 * že odebrané právo dvanáct hodin nic neznamená, je to laciné. */
export async function vyzadujRoli(req, ...role) {
  const r = await prihlaseny(req);
  if (!r) return { chyba: json({ ok: false, chyba: 'Nepřihlášen.' }, 401) };

  const ucet = await (await uloziste('uzivatele')).cti(r.email);
  if (!ucet)
    return { chyba: json({ ok: false, chyba: 'Účet už neexistuje. Přihlaste se znovu.' }, 401) };
  if (ucet.aktivni === false)
    return { chyba: json({ ok: false, chyba: 'Účet je vypnutý. Obraťte se na správce.' }, 401) };

  /* Profil (titul, funkce, telefon) jde s relací, protože se čte účet stejně
   * tak jako tak. Podpis ne — ten je stranou a dotahuje se jen tam, kde je
   * opravdu potřeba (přihlášení a /api/ja), ne při každém uložení zakázky. */
  const relace = { ...r, ...profilZUctu(ucet), email: r.email, role: ucet.role };
  if (role.length && !role.includes(relace.role))
    return { chyba: json({ ok: false, chyba: 'K této akci je potřeba role: ' + role.join(' / ') + '.' }, 403) };
  return { relace, ucet };
}
