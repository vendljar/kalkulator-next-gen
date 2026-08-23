/* ============================================================
 * DOCXGEN – vyplnění šablony .docx přímo v prohlížeči
 * Bez externích knihoven (podmínka: jednosouborová aplikace bez CDN).
 * DOCX je ZIP archiv: čteme přes DecompressionStream('deflate-raw')
 * (vestavěné API prohlížeče), zapisujeme bez komprese (STORE) –
 * Word i Google Docs takový soubor běžně otevřou.
 * Zástupné symboly {{KLÍČ}} nahrazuje i tehdy, když je Word rozdělí
 * mezi více runů (typicky po ruční editaci šablony).
 * ============================================================ */

/* ---------- CRC32 (pro zápis ZIP) ---------- */
const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TAB[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------- čtení ZIP ---------- */
async function zipPrecti(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // najdi End of Central Directory (PK\x05\x06) od konce
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65536); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Soubor není platný .docx (ZIP).');
  const pocet = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dekoder = new TextDecoder();
  const polozky = [];
  for (let n = 0; n < pocet; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('Poškozený ZIP adresář.');
    const metoda = dv.getUint16(off + 10, true);
    const velKomp = dv.getUint32(off + 20, true);
    const delkaNazvu = dv.getUint16(off + 28, true);
    const delkaExtra = dv.getUint16(off + 30, true);
    const delkaKom = dv.getUint16(off + 32, true);
    const lokalOff = dv.getUint32(off + 42, true);
    const nazev = dekoder.decode(u8.subarray(off + 46, off + 46 + delkaNazvu));
    // lokální hlavička – vlastní délky názvu/extra
    const lN = dv.getUint16(lokalOff + 26, true), lE = dv.getUint16(lokalOff + 28, true);
    const dataZac = lokalOff + 30 + lN + lE;
    const komprimovana = u8.subarray(dataZac, dataZac + velKomp);
    let data;
    if (metoda === 0) data = new Uint8Array(komprimovana);
    else if (metoda === 8) {
      const ds = new DecompressionStream('deflate-raw');
      data = new Uint8Array(await new Response(new Blob([komprimovana]).stream().pipeThrough(ds)).arrayBuffer());
    } else throw new Error('Nepodporovaná komprese v ZIP: ' + metoda);
    polozky.push({ nazev, data });
    off += 46 + delkaNazvu + delkaExtra + delkaKom;
  }
  return polozky;
}

/* ---------- zápis ZIP (STORE, bez komprese) ---------- */
function zipZapis(polozky, mime) {
  const enkoder = new TextEncoder();
  const casti = [], centrala = [];
  let offset = 0;
  const u16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  for (const p of polozky) {
    const jmeno = enkoder.encode(p.nazev);
    const crc = crc32(p.data);
    const hl = [u32(0x04034b50), u16(20), u16(0x0800 /*UTF-8*/), u16(0), u16(0), u16(0),
      u32(crc), u32(p.data.length), u32(p.data.length), u16(jmeno.length), u16(0)];
    casti.push(...hl, jmeno, p.data);
    centrala.push({ jmeno, crc, delka: p.data.length, offset });
    offset += hl.reduce((a, b) => a + b.length, 0) + jmeno.length + p.data.length;
  }
  const cdZac = offset;
  for (const c of centrala) {
    const zaznam = [u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.delka), u32(c.delka), u16(c.jmeno.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(c.offset)];
    casti.push(...zaznam, c.jmeno);
    offset += zaznam.reduce((a, b) => a + b.length, 0) + c.jmeno.length;
  }
  casti.push(u32(0x06054b50), u16(0), u16(0), u16(centrala.length), u16(centrala.length),
    u32(offset - cdZac), u32(cdZac), u16(0));
  return new Blob(casti, { type: mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------- náhrada {{...}} v XML ---------- */
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function nahradPlaceholdery(xml, ph) {
  // {{KLÍČ}} i rozdělené mezi runy: {{ / KLÍČ / }} mohou být proloženy XML tagy
  return xml.replace(/\{(?:<[^>]+>)*\{((?:<[^>]+>|[A-Z0-9_])+)\}(?:<[^>]+>)*\}/g, (cely, vnitrek) => {
    const klic = vnitrek.replace(/<[^>]+>/g, '');
    return ph[klic] != null ? xmlEsc(ph[klic]) : cely;
  });
}

/* ---------- odstranění prázdných řádků/sekcí technické specifikace ----------
 * Do nabídky se propíší jen vyplněné a platné řádky. Řádek tabulky, který
 * obsahuje aspoň jeden placeholder TS_* a všechny jeho TS_* placeholdery se
 * plní prázdnou hodnotou (po trim jedno z '', '-', '–', '—'), se z dokumentu
 * odstraní i s popiskem. Víceplaceholderový řádek (rozměr š×h, počet stanic)
 * zůstává, je-li aspoň jedna hodnota vyplněná. Hlavičkové symboly (OBJEDNATEL…)
 * řádky nikdy neodstraňují. Pak se odstraní i sekční pruhy, které po vyčištění
 * nemají jediný datový řádek (následuje přímo další sekce nebo konec tabulky). */
const TS_SEKCE_NAZVY = ['ZÁKLADNÍ PARAMETRY ŠACHTY', 'KONSTRUKČNÍ ŘEŠENÍ ŠACHTY',
  'OPLÁŠTĚNÍ ŠACHTY', 'DOPLŇKOVÉ KONSTRUKCE', 'STAVEBNÍ A PŘÍPRAVNÉ PRÁCE',
  'PROJEKČNÍ A PŘÍPRAVNÉ PRÁCE', 'SOUČÁSTÍ DODÁVKY NENÍ'];

function jePrazdnaHodnota(v) {
  const t = String(v == null ? '' : v).trim();
  return t === '' || t === '-' || t === '–' || t === '—';
}
/* klíče {{...}} ve fragmentu (i rozdělené mezi runy) */
function klicePlaceholderu(fragment) {
  const klice = [];
  fragment.replace(/\{(?:<[^>]+>)*\{((?:<[^>]+>|[A-Z0-9_])+)\}(?:<[^>]+>)*\}/g, (_c, vnitrek) => {
    klice.push(vnitrek.replace(/<[^>]+>/g, '')); return _c;
  });
  return klice;
}
/* páry <w:tr>…</w:tr> se správným párováním (počítání vnoření – tabulka v tabulce) */
function radkoveSpany(xml) {
  const ev = [];
  let m;
  const reO = /<w:tr[\s>]/g, reC = /<\/w:tr>/g;
  while ((m = reO.exec(xml))) ev.push([m.index, 1]);
  while ((m = reC.exec(xml))) ev.push([m.index, -1]);
  ev.sort((a, b) => a[0] - b[0]);
  const zas = [], spany = [];
  for (const [idx, typ] of ev) {
    if (typ === 1) zas.push(idx);
    else { const z = zas.pop(); if (z != null) spany.push({ zac: z, kon: idx + 7, hloubka: zas.length }); }
  }
  spany.sort((a, b) => a.zac - b.zac);   // '</w:tr>'.length === 7
  return spany;
}
/* vlastní obsah řádku bez vnořených řádků (aby vnořený neovlivnil nadřazený) */
function vlastniObsahRadku(radek) {
  return radek.replace(/^<w:tr[\s>][^>]*>/, '').replace(/<\/w:tr>\s*$/, '')
    .replace(/<w:tr[\s>][\s\S]*?<\/w:tr>/g, '');
}
/* text řádku (spojení <w:t>) – pro rozpoznání sekčního pruhu */
function textRadku(fragment) {
  const casti = fragment.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [];
  return casti.map(t => t.replace(/<[^>]*>/g, '')).join('').replace(/\s+/g, ' ').trim();
}
function odstranPrazdneTsRadky(xml, ph) {
  ph = ph || {};
  // fáze A – prázdné datové řádky s TS_ placeholdery
  const kOdstr = [];
  for (const sp of radkoveSpany(xml)) {
    const obsah = vlastniObsahRadku(xml.slice(sp.zac, sp.kon));
    const tsKlice = klicePlaceholderu(obsah).filter(k => k.startsWith('TS_'));
    if (tsKlice.length && tsKlice.every(k => (k in ph) && jePrazdnaHodnota(ph[k]))) kOdstr.push(sp);
  }
  // neodstraňuj nadřazený řádek kvůli vnořenému – ponech jen vnější z překrývajících
  const vyber = kOdstr.filter(sp => !kOdstr.some(o => o !== sp && o.zac <= sp.zac && sp.kon <= o.kon && o.hloubka < sp.hloubka));
  vyber.sort((a, b) => b.zac - a.zac);
  for (const sp of vyber) xml = xml.slice(0, sp.zac) + xml.slice(sp.kon);

  // fáze B – prázdné sekční pruhy (řádek = jen název sekce, po něm přímo další sekce/konec tabulky)
  const spany = radkoveSpany(xml).filter(sp => sp.hloubka === 0);
  const sekOdstr = [];
  for (let i = 0; i < spany.length; i++) {
    const radek = xml.slice(spany[i].zac, spany[i].kon);
    if (klicePlaceholderu(radek).length) continue;
    if (!TS_SEKCE_NAZVY.includes(textRadku(vlastniObsahRadku(radek)))) continue;
    const dalsi = spany[i + 1];
    let prazdna;
    if (!dalsi) prazdna = true;                                   // konec dokumentu
    else if (/<\/w:tbl>/.test(xml.slice(spany[i].kon, dalsi.zac))) prazdna = true;   // konec tabulky
    else {
      const dR = xml.slice(dalsi.zac, dalsi.kon);
      prazdna = !klicePlaceholderu(dR).length && TS_SEKCE_NAZVY.includes(textRadku(vlastniObsahRadku(dR)));
    }
    if (prazdna) sekOdstr.push(spany[i]);
  }
  sekOdstr.sort((a, b) => b.zac - a.zac);
  for (const sp of sekOdstr) xml = xml.slice(0, sp.zac) + xml.slice(sp.kon);
  return xml;
}

/* ---------- dynamické bloky: tabulka s {{PRIP_NAZEV}} se naklonuje pro každý příplatek ---------- */
function najdiTabulku(xml, pozice) {
  const udalosti = [];
  let m;
  const reO = /<w:tbl[ >]/g, reC = /<\/w:tbl>/g;
  while ((m = reO.exec(xml))) udalosti.push([m.index, 1]);
  while ((m = reC.exec(xml))) udalosti.push([m.index, -1]);
  udalosti.sort((a, b) => a[0] - b[0]);
  const zasobnik = [];
  for (const [idx, typ] of udalosti) {
    if (typ === 1) zasobnik.push(idx);
    else {
      const zac = zasobnik.pop();
      const kon = idx + '</w:tbl>'.length;
      if (zac != null && zac <= pozice && pozice < kon) return { zac, kon };
    }
  }
  return null;
}
function expandujPriplatky(xml, priplatky) {
  const marker = xml.search(/\{(?:<[^>]+>)*\{(?:<[^>]+>|[A-Z0-9_])*PRIP_NAZEV/);
  if (marker < 0) return xml;                    // šablona bez prototypového bloku
  const t = najdiTabulku(xml, marker);
  if (!t) return xml;
  const proto = xml.slice(t.zac, t.kon);
  const kopie = (priplatky || []).map(p =>
    nahradPlaceholdery(proto, { PRIP_NAZEV: p.nazev, PRIP_POPIS: p.popis, PRIP_CENA: p.cena }));
  return xml.slice(0, t.zac) + (kopie.length ? kopie.join('<w:p/>') : '<w:p/>') + xml.slice(t.kon);
}

/* ============================================================
 * OBRÁZKY V ŠABLONĚ (#146) – podpis a razítko zpracovatele nabídky
 *
 * Text se do dokumentu dostane symbolem {{...}}, obrázek ale ne – ten musí
 * do souboru vstoupit jako bajty a musí na něj vést relace. Řešíme to tak,
 * že se obrázek NEVKLÁDÁ nově: v šabloně zůstane původní plovoucí tvar
 * (VML <v:shape>) i s pozicí, obtékáním a velikostí, jak si ho uživatel ve
 * Wordu nastavil. Označí se alternativním textem, tedy ve Wordu
 * Formát obrázku → Alternativní text → Název: {{ZPRAC_PODPIS}}.
 *
 * Proč zrovna takhle:
 *  – vzhled nabídky se nezmění ani o milimetr a uživatel si může tvar ve
 *    Wordu chytit myší, posunout ho nebo zvětšit; kód to bude respektovat,
 *  – odpadá starost se jmennými prostory (kořen šablony nemá xmlns:a ani
 *    xmlns:pic, takže moderní <w:drawing> by se do ní musel doplňovat),
 *  – je to podstatně méně kódu než vlastní generátor obrázkových částí.
 *
 * Když přihlášený obchodní technik podpis nahraný nemá, celý tvar
 * z dokumentu zmizí. V nabídce nesmí zůstat cizí podpis ani prázdný rámeček.
 * ============================================================ */

/* Přípony podle typu obsahu. Držíme se jen rastrových formátů, které Word
 * spolehlivě vykreslí; SVG je XML, které umí nést skript, a do dokumentu
 * odcházejícího zákazníkovi nepatří (stejné pravidlo hlídá i server). */
const OBRAZEK_TYPY = { 'image/png': 'png', 'image/jpeg': 'jpeg' };

/* Rozbor data URL („data:image/png;base64,iVBOR…“) na typ a bajty.
 * Podpis přichází z profilu uživatele právě v této podobě – prohlížeč ho tak
 * vyrobí při nahrání i uloží na server, takže se nikde nemusí překlápět. */
function dataUrlNaBajty(dataUrl) {
  const s = String(dataUrl || '');
  const m = /^data:([a-z/+.-]+);base64,([\s\S]+)$/i.exec(s);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const pripona = OBRAZEK_TYPY[mime];
  if (!pripona) return null;
  let bin;
  try {
    bin = typeof atob === 'function' ? atob(m[2].replace(/\s+/g, ''))
      : Buffer.from(m[2], 'base64').toString('binary');
  } catch (e) { return null; }
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i) & 255;
  if (!data.length) return null;
  return { mime, pripona, data };
}

/* Rozměry v bodech obrázku (pixelech) přímo z hlavičky souboru.
 * Potřebujeme je jen kvůli poměru stran – bez něj by se podpis v rámečku
 * roztáhl a razítko by bylo oválné. Vrací null, když formát nepoznáme;
 * volající pak velikost tvaru nechá tak, jak je v šabloně. */
function rozmeryObrazku(u8) {
  if (!u8 || u8.length < 24) return null;
  // PNG: signatura + chunk IHDR, šířka a výška jsou na pevných pozicích
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    const cti = i => (u8[i] << 24 | u8[i + 1] << 16 | u8[i + 2] << 8 | u8[i + 3]) >>> 0;
    const s = cti(16), v = cti(20);
    return s && v ? { sirka: s, vyska: v } : null;
  }
  // JPEG: procházíme značky, dokud nenarazíme na hlavičku rámce (SOFn)
  if (u8[0] === 0xFF && u8[1] === 0xD8) {
    let i = 2;
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xFF) { i++; continue; }
      const znacka = u8[i + 1];
      if (znacka === 0xFF || znacka === 0x01 || (znacka >= 0xD0 && znacka <= 0xD9)) { i += 2; continue; }
      const delka = (u8[i + 2] << 8) | u8[i + 3];
      const jeRamec = (znacka >= 0xC0 && znacka <= 0xCF)
        && znacka !== 0xC4 && znacka !== 0xC8 && znacka !== 0xCC;
      if (jeRamec) {
        const v = (u8[i + 5] << 8) | u8[i + 6], s = (u8[i + 7] << 8) | u8[i + 8];
        return s && v ? { sirka: s, vyska: v } : null;
      }
      if (delka < 2) return null;
      i += 2 + delka;
    }
  }
  return null;
}

/* Najde tag (<…>), uvnitř kterého leží zadaná pozice. */
function obalTagu(xml, poz) {
  const zac = xml.lastIndexOf('<', poz);
  const kon = xml.indexOf('>', poz);
  return zac < 0 || kon < 0 ? null : { zac, kon: kon + 1, text: xml.slice(zac, kon + 1) };
}
/* Odstraní celý <w:r>…</w:r>, ve kterém tvar leží. Kdybychom smazali jen
 * <w:pict>, zůstal by v dokumentu prázdný run – Word ho sice snese, ale
 * v nabídce by po něm mohla zůstat mezera navíc. */
function odstranRunSTvarem(xml, poz) {
  const zacR = Math.max(xml.lastIndexOf('<w:r>', poz), xml.lastIndexOf('<w:r ', poz));
  const konR = xml.indexOf('</w:r>', poz);
  if (zacR >= 0 && konR > zacR) return xml.slice(0, zacR) + xml.slice(konR + 6);
  const zacP = xml.lastIndexOf('<w:pict', poz), konP = xml.indexOf('</w:pict>', poz);
  if (zacP >= 0 && konP > zacP) return xml.slice(0, zacP) + xml.slice(konP + 9);
  return xml;
}

/* Přepočet velikosti tvaru tak, aby se obrázek vešel do PŮVODNÍHO rámečku
 * a zachoval poměr stran. Rámeček zůstává tím, co uživatel nastavil ve
 * Wordu – měníme jen to, kolik z něj obrázek zabere. */
function upravRozmeryTvaru(tag, rozmery) {
  if (!rozmery) return tag;
  const m = /style="([^"]*)"/.exec(tag);
  if (!m) return tag;
  const styl = m[1];
  const ms = /width:\s*([\d.]+)pt/.exec(styl), mv = /height:\s*([\d.]+)pt/.exec(styl);
  if (!ms || !mv) return tag;
  const ramS = Number(ms[1]), ramV = Number(mv[1]);
  if (!(ramS > 0 && ramV > 0)) return tag;
  const pomer = rozmery.sirka / rozmery.vyska;
  let s = ramS, v = ramS / pomer;
  if (v > ramV) { v = ramV; s = ramV * pomer; }
  const zaokr = x => String(Math.round(x * 100) / 100);
  const novy = styl.replace(/width:\s*[\d.]+pt/, 'width:' + zaokr(s) + 'pt')
                   .replace(/height:\s*[\d.]+pt/, 'height:' + zaokr(v) + 'pt');
  return tag.slice(0, m.index) + 'style="' + novy + '"' + tag.slice(m.index + m[0].length);
}

/* Totéž pro novější způsob vložení obrázku (DrawingML). Rámeček tu není
 * ve stylu, ale v atributech `cx`/`cy` (EMU – 914 400 na palec): `<wp:extent>`
 * je velikost, kterou Word vykreslí, `<a:ext>` uvnitř tvaru totéž. Word
 * obrázek do rámečku SÁM nevepíše — nakreslí ho přesně na zadané rozměry —
 * takže fotka na výšku vložená do rámečku na šířku by se roztáhla. Proto se
 * rozměry dopočítávají stejně jako u VML: obrázek se do původního rámečku
 * vepíše se zachovaným poměrem stran.
 *
 * `poz` ukazuje na alternativní text uvnitř `<wp:docPr>`, hledá se tedy
 * odtud nahoru začátek `<wp:inline>` / `<wp:anchor>` a dolů jeho konec —
 * mimo tenhle rozsah se nesahá, aby se nepřepsal jiný obrázek na stránce. */
function upravRozmeryDrawing(xml, poz, rozmery) {
  if (!rozmery || !(rozmery.sirka > 0 && rozmery.vyska > 0)) return xml;
  const zac = Math.max(xml.lastIndexOf('<wp:inline', poz), xml.lastIndexOf('<wp:anchor', poz));
  if (zac < 0) return xml;
  const konI = xml.indexOf('</wp:inline>', poz), konA = xml.indexOf('</wp:anchor>', poz);
  const kon = Math.min(konI < 0 ? Infinity : konI, konA < 0 ? Infinity : konA);
  if (!isFinite(kon)) return xml;

  const usek = xml.slice(zac, kon);
  const ram = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(usek);
  if (!ram) return xml;
  const ramS = Number(ram[1]), ramV = Number(ram[2]);
  if (!(ramS > 0 && ramV > 0)) return xml;

  const pomer = rozmery.sirka / rozmery.vyska;
  let s = ramS, v = Math.round(ramS / pomer);
  if (v > ramV) { v = ramV; s = Math.round(ramV * pomer); }
  const nahrad = (t, tag) => t.replace(new RegExp('<' + tag + '\\b[^>]*>', 'g'), m2 =>
    m2.replace(/\bcx="\d+"/, 'cx="' + s + '"').replace(/\bcy="\d+"/, 'cy="' + v + '"'));
  /* `a:ext` je uvnitř tvaru (pic:spPr → a:xfrm) a musí jít s rámečkem –
   * jinak Word vykreslí obrázek v jedné velikosti a ořízne ho podle druhé. */
  return xml.slice(0, zac) + nahrad(nahrad(usek, 'wp:extent'), 'a:ext') + xml.slice(kon);
}

/* Vymění obrázky označené alternativním textem {{KLÍČ}} za obrázky z mapy
 * `obrazky` ({ KLÍČ: 'data:image/png;base64,…' }). Mění položky archivu na
 * místě a vrací počet zásahů (aby volající poznal, že se šablona změnila,
 * i když v ní žádný textový symbol nebyl). */
function docxVlozObrazky(polozky, obrazky) {
  const dekoder = new TextDecoder(), enkoder = new TextEncoder();
  const najdi = n => polozky.find(p => p.nazev === n);
  let zasahu = 0;

  for (const p of polozky) {
    const m = /^word\/((document|header\d*|footer\d*)\.xml)$/.exec(p.nazev);
    if (!m) continue;
    let xml = dekoder.decode(p.data);
    /* DVA ZPŮSOBY, JAK JE OBRÁZEK V DOKUMENTU (12. 8. 2026).
     *
     * Starší Word ukládá plovoucí obrázky jako VML (`<v:shape>` s
     * `<v:imagedata o:title="…">`), novější jako DrawingML (`<w:drawing>`
     * s `<wp:docPr descr="…">` a `<a:blip r:embed="…">`). Alternativní text,
     * kterým se v šabloně označuje místo pro fotku, sedí pokaždé v jiném
     * atributu — a šablona nabídky PROJ je celá v tom novějším způsobu.
     *
     * Hledají se proto obě značky najednou; zbytek postupu (dohledat cíl
     * v .rels, přepsat bajty média, dorovnat rozměry) je společný. */
    if (xml.indexOf('o:title="{{') < 0 && !/(?:descr|title)="\{\{/.test(xml)) continue;
    const relsNazev = 'word/_rels/' + m[1] + '.rels';

    // od konce, aby se pozice dřívějších výskytů nerozházely mazáním
    const pozice = [];
    const re = /(?:o:title|descr|title)="\{\{([A-Z0-9_]+)\}\}"/g;
    let x;
    while ((x = re.exec(xml))) pozice.push({ poz: x.index, klic: x[1], cely: x[0],
                                             vml: x[0].indexOf('o:title=') === 0 });

    for (let i = pozice.length - 1; i >= 0; i--) {
      const { poz, klic, cely } = pozice[i];
      const obr = dataUrlNaBajty(obrazky ? obrazky[klic] : null);
      if (!obr) { xml = odstranRunSTvarem(xml, poz); zasahu++; continue; }

      const tag = obalTagu(xml, poz);
      /* VML nese odkaz na médium přímo v tomtéž tagu (`r:id`), DrawingML ho má
       * až v `<a:blip r:embed="…">` o kus dál — proto se u něj hledá dopředu.
       * Rozsah je omezený, aby se nechytil obrázek z úplně jiného odstavce. */
      const mId = pozice[i].vml
        ? (tag && /r:id="([^"]+)"/.exec(tag.text))
        : /<a:blip[^>]*r:embed="([^"]+)"/.exec(xml.slice(poz, poz + 4000));
      const rels = najdi(relsNazev);
      let relsXml = rels ? dekoder.decode(rels.data) : '';
      const mRel = mId && new RegExp('<Relationship[^>]*Id="' + mId[1] + '"[^>]*>').exec(relsXml);
      const mCil = mRel && /Target="([^"]+)"/.exec(mRel[0]);
      const cast = mCil && najdi('word/' + mCil[1].replace(/^\/+/, ''));
      /* Šablona, ve které tvar na nic neukazuje (třeba po ruční editaci),
       * nesmí shodit celé generování – nabídka je důležitější než podpis. */
      if (!cast) { xml = odstranRunSTvarem(xml, poz); zasahu++; continue; }

      cast.data = obr.data;
      const puvodniPripona = (/\.([a-z0-9]+)$/i.exec(cast.nazev) || [, ''])[1].toLowerCase();
      if (puvodniPripona !== obr.pripona) {
        const novyNazev = cast.nazev.replace(/\.[a-z0-9]+$/i, '.' + obr.pripona);
        const novyCil = mCil[1].replace(/\.[a-z0-9]+$/i, '.' + obr.pripona);
        cast.nazev = novyNazev;
        relsXml = relsXml.slice(0, mRel.index)
          + mRel[0].replace('Target="' + mCil[1] + '"', 'Target="' + novyCil + '"')
          + relsXml.slice(mRel.index + mRel[0].length);
        rels.data = enkoder.encode(relsXml);
        // typ obsahu pro novou příponu – bez něj Word soubor odmítne otevřít
        const ct = najdi('[Content_Types].xml');
        if (ct) {
          let ctXml = dekoder.decode(ct.data);
          if (!new RegExp('Extension="' + obr.pripona + '"', 'i').test(ctXml)) {
            ctXml = ctXml.replace(/<Types([^>]*)>/,
              '<Types$1><Default Extension="' + obr.pripona + '" ContentType="' + obr.mime + '"/>');
            ct.data = enkoder.encode(ctXml);
          }
        }
      }

      /* Úklid značky (aby v odeslaném souboru nezůstal {{…}}) děláme dřív než
       * velikost: tvar začíná před značkou, takže se jeho pozice tímhle
       * zásahem neposune a nemusíme nic přepočítávat. */
      const prazdna = pozice[i].vml ? 'o:title=""' : cely.replace(/"\{\{[A-Z0-9_]+\}\}"/, '""');
      xml = xml.slice(0, poz) + prazdna + xml.slice(poz + cely.length);
      if (pozice[i].vml) {
        const shp = xml.lastIndexOf('<v:shape', poz);
        if (shp >= 0) {
          const konShp = xml.indexOf('>', shp) + 1;
          const upraveny = upravRozmeryTvaru(xml.slice(shp, konShp), rozmeryObrazku(obr.data));
          xml = xml.slice(0, shp) + upraveny + xml.slice(konShp);
        }
      } else {
        xml = upravRozmeryDrawing(xml, poz, rozmeryObrazku(obr.data));
      }
      zasahu++;
    }
    p.data = enkoder.encode(xml);
  }
  return zasahu;
}

/* ---------- hlavní funkce: vyplní šablonu a vrátí Blob .docx ---------- */
async function docxVyplnSablonu(arrayBuffer, placeholders, priplatky, obrazky) {
  const polozky = await zipPrecti(new Uint8Array(arrayBuffer));
  const dekoder = new TextDecoder(), enkoder = new TextEncoder();
  /* Obrázky nejdřív: pracují s alternativním textem {{…}}, který by textová
   * náhrada mohla považovat za neznámý symbol a nechat v dokumentu. */
  const obrazku = docxVlozObrazky(polozky, obrazky || {});
  let nahrad = 0;
  for (const p of polozky) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(p.nazev)) {
      const pred = dekoder.decode(p.data);
      let po = pred;
      if (p.nazev === 'word/document.xml') {
        po = expandujPriplatky(po, priplatky);
        po = odstranPrazdneTsRadky(po, placeholders);   // prázdné/„-“ řádky TS pryč
      }
      po = nahradPlaceholdery(po, placeholders);
      if (po !== pred) nahrad++;
      p.data = enkoder.encode(po);
    }
  }
  if (!nahrad && !obrazku) throw new Error('V šabloně nebyly nalezeny žádné symboly {{...}} – je to správný soubor šablony?');
  return zipZapis(polozky);
}

/* ============================================================
 * GENEROVÁNÍ .docx OD NULY (bez šablony) – pro krycí list apod.
 * Sestaví minimální validní .docx z nadpisu a sekcí (label → hodnota).
 * Word i Google Docs takový soubor otevřou. Sdílí ZIP zápis (zipZapis).
 * ============================================================ */
function docxEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
/* odstavec; o = {b:bold, sz:half-points, color:'RRGGBB', fill:'RRGGBB', after:twips} */
function docxPar(text, o) {
  o = o || {};
  const rpr = (o.b ? '<w:b/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '')
    + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
  const ppr = `<w:pPr>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}`
    + `<w:spacing w:after="${o.after != null ? o.after : 40}" w:line="240" w:lineRule="auto"/>`
    + (rpr ? `<w:rPr>${rpr}</w:rPr>` : '') + '</w:pPr>';
  return `<w:p>${ppr}<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${docxEsc(text)}</w:t></w:r></w:p>`;
}
function docxCell(inner, w, o) {
  o = o || {};
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>`
    + (o.span ? `<w:gridSpan w:val="${o.span}"/>` : '')
    + (o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '')
    + '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/>'
    + '<w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
    + '</w:tcPr>' + inner + '</w:tc>';
}
/* Sestaví tělo dokumentu: nadpis + sekce s dvousloupcovou tabulkou (popis → hodnota). */
function docxTeloZeSekci(nadpis, sekce) {
  const W1 = 3400, W2 = 5600, WFULL = W1 + W2;
  let body = docxPar(nadpis, { b: true, sz: 32, after: 160 });
  (sekce || []).forEach(s => {
    const hlava = `<w:tr>${docxCell(docxPar(s.sekce, { b: true, sz: 20, color: 'FFFFFF', after: 0 }), WFULL, { span: 2, fill: '2B3850' })}</w:tr>`;
    const radky = (s.radky || []).map(([l, v]) =>
      `<w:tr>${docxCell(docxPar(l, { b: true, sz: 18, after: 0 }), W1, { fill: 'EEF2F8' })}`
      + `${docxCell(docxPar(v, { sz: 18, after: 0 }), W2)}</w:tr>`).join('');
    body += `<w:tbl><w:tblPr><w:tblW w:w="${WFULL}" w:type="dxa"/>`
      + '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="C7D0DB"/><w:left w:val="single" w:sz="4" w:color="C7D0DB"/>'
      + '<w:bottom w:val="single" w:sz="4" w:color="C7D0DB"/><w:right w:val="single" w:sz="4" w:color="C7D0DB"/>'
      + '<w:insideH w:val="single" w:sz="4" w:color="C7D0DB"/><w:insideV w:val="single" w:sz="4" w:color="C7D0DB"/></w:tblBorders>'
      + `</w:tblPr><w:tblGrid><w:gridCol w:w="${W1}"/><w:gridCol w:w="${W2}"/></w:tblGrid>`
      + hlava + radky + '</w:tbl>' + docxPar('', { after: 80 });
  });
  return body;
}
/* Zabalí tělo do minimálního .docx a vrátí Blob. */
function docxSestavBlob(bodyXml) {
  const enc = new TextEncoder();
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + bodyXml
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';
  return zipZapis([
    { nazev: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { nazev: '_rels/.rels', data: enc.encode(rels) },
    { nazev: 'word/document.xml', data: enc.encode(doc) },
  ]);
}
/* Vysokoúrovňové: nadpis + sekce → Blob .docx */
function docxDokumentBlob(nadpis, sekce) { return docxSestavBlob(docxTeloZeSekci(nadpis, sekce)); }

/* ============================================================
 * JAZYKOVÉ MUTACE ŠABLONY (N1) – z české .docx šablony vyrobí EN/DE/FR
 * Pevný (napsaný) text šablony se přeloží slovníkem z preklad.js,
 * zástupné symboly {{...}} zůstávají netknuté – vyplní se až při
 * generování dokumentu (docxVyplnSablonu) hodnotami v témže jazyce.
 *
 * Jednotkou překladu je ODSTAVEC, ne jednotlivý <w:t>: Word běžně
 * rozseká i krátkou větu do několika runů (kontrola pravopisu, revize),
 * takže po jednotlivých runech by se ve slovníku nic nenašlo. Text
 * celého odstavce se proto spojí, přeloží a vloží zpět do prvního runu;
 * ostatní runy odstavce se vyprázdní (formát prvního runu se zachová).
 * ============================================================ */
function xmlUnesc(s) {
  return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#\d+;/g, m =>
      String.fromCharCode(+m.slice(2, -1))).replace(/&amp;/g, '&');
}
/* spány odstavců <w:p …> … </w:p> (samostatné <w:p/> se ignorují) */
function odstavcoveSpany(xml) {
  const ev = [];
  let m;
  const reO = /<w:p(?:\s[^>]*[^/])?>/g, reC = /<\/w:p>/g;
  while ((m = reO.exec(xml))) ev.push([m.index, 1]);
  while ((m = reC.exec(xml))) ev.push([m.index, -1]);
  ev.sort((a, b) => a[0] - b[0]);
  const zas = [], spany = [];
  for (const [idx, typ] of ev) {
    if (typ === 1) zas.push(idx);
    else { const z = zas.pop(); if (z != null) spany.push({ zac: z, kon: idx + 6 }); } // '</w:p>'.length === 6
  }
  return spany.sort((a, b) => a.zac - b.zac);
}
/* text odstavce ze spojených runů (bez XML entit) */
function odstavecText(odst) {
  const casti = odst.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
  return casti.map(t => xmlUnesc(t.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, ''))).join('');
}
/* přeloží pevný text v jednom XML dílu dokumentu */
function docxPrelozXml(xml, lang, stat) {
  const prelozit = typeof trStav === 'function' ? trStav : null;
  if (!prelozit) throw new Error('Slovník překladů (preklad.js) není k dispozici.');
  const spany = odstavcoveSpany(xml).filter(sp => {
    const vnitrek = xml.slice(sp.zac, sp.kon).replace(/^<w:p(?:\s[^>]*)?>/, '');
    return !/<w:p(?:\s[^>]*[^/])?>/.test(vnitrek);          // jen nejvnitřnější odstavce
  });
  for (let i = spany.length - 1; i >= 0; i--) {             // odzadu, ať sedí offsety
    const sp = spany[i], cely = xml.slice(sp.zac, sp.kon);
    const text = odstavecText(cely);
    if (!text.trim()) continue;
    if (/\{\{|\}\}/.test(text)) continue;                   // odstavec se symbolem {{…}} se nedotýkáme
    const st = prelozit(text, lang);
    stat.celkem++;
    if (st.zdroj === 'neutrální') { stat.neutralni++; continue; }
    if (!st.prelozeno) { stat.chybi.push(text); continue; }
    stat.prelozeno++;
    let n = 0;
    const novy = cely.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () =>
      '<w:t xml:space="preserve">' + (n++ === 0 ? xmlEsc(st.text) : '') + '</w:t>');
    xml = xml.slice(0, sp.zac) + novy + xml.slice(sp.kon);
  }
  return xml;
}
/* Hlavní funkce: česká šablona (ArrayBuffer) → přeložená šablona (Blob .docx).
 * stat (volitelně) se naplní statistikou: celkem/prelozeno/neutralni/chybi[]. */
async function docxPrelozSablonu(arrayBuffer, lang, stat) {
  stat = stat || {};
  stat.celkem = 0; stat.prelozeno = 0; stat.neutralni = 0; stat.chybi = [];
  if (!lang || lang === 'cz') throw new Error('Zvolte cílový jazyk šablony (EN / DE / FR).');
  const polozky = await zipPrecti(new Uint8Array(arrayBuffer));
  const dekoder = new TextDecoder(), enkoder = new TextEncoder();
  let dotceno = 0;
  for (const p of polozky) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(p.nazev)) continue;
    const pred = dekoder.decode(p.data);
    const po = docxPrelozXml(pred, lang, stat);
    if (po !== pred) dotceno++;
    p.data = enkoder.encode(po);
  }
  if (!stat.celkem) throw new Error('V šabloně nebyl nalezen žádný text k překladu – je to správný soubor .docx?');
  stat.dotceno = dotceno;
  stat.procenta = stat.celkem ? Math.round(stat.prelozeno / (stat.celkem - stat.neutralni || 1) * 100) : 0;
  return zipZapis(polozky);
}

if (typeof module !== 'undefined')
  module.exports = { docxVyplnSablonu, nahradPlaceholdery, expandujPriplatky, zipPrecti, zipZapis, crc32,
    odstranPrazdneTsRadky, jePrazdnaHodnota, klicePlaceholderu,
    docxVlozObrazky, rozmeryObrazku, dataUrlNaBajty,
    docxDokumentBlob, docxTeloZeSekci, docxSestavBlob, docxPar, docxEsc,
    docxPrelozSablonu, docxPrelozXml, odstavcoveSpany, odstavecText, xmlUnesc };
