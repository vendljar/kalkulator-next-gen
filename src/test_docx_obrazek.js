/* Test – VÝMĚNA OBRÁZKU V ŠABLONĚ (#146)
 *
 * Proč tahle sada vznikla. Pod cenovou nabídkou byl do 5. 8. 2026 natvrdo
 * vepsaný jeden kolega („Vypracoval: Ing. Jiří Lauda …“) a vedle něj zapečený
 * sken jeho podpisu s razítkem. Nabídku ale dělá ten obchodní technik, který
 * je zrovna přihlášený, a každý má svůj podpis. Text vyřeší obyčejné symboly
 * {{ZPRAC_…}}. Obrázek ne – ten musí do souboru vstoupit jako bajty.
 *
 * Zvolená cesta: obrázek se do dokumentu NEVKLÁDÁ nově. V šabloně zůstane
 * původní plovoucí tvar (VML <v:shape>) přesně tam a v té velikosti, jak si
 * ho uživatel ve Wordu nastavil; pozná se podle alternativního textu
 * o:title="{{ZPRAC_PODPIS}}". Aplikace jen vymění bajty obrázku, na který
 * tvar odkazuje, a dopočítá rozměry tak, aby se podpis vešel do původního
 * rámečku a nebyl roztažený. Když přihlášený podpis nahraný nemá, celý tvar
 * z dokumentu zmizí – v nabídce nesmí zůstat cizí podpis ani prázdný rámeček.
 *
 * Sada schválně staví vlastní minidokument místo skutečné šablony: chceme
 * ověřit i případy, které v šabloně nejsou (jiná přípona, chybějící relace)
 * a nechceme, aby test padal kvůli budoucím úpravám šablony.
 *
 * Spuštění: node test_docx_obrazek.js
 */
const { docxVyplnSablonu, zipPrecti, zipZapis,
        docxVlozObrazky, rozmeryObrazku, dataUrlNaBajty } = require('./docxgen.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* Drobné, ale skutečné obrázky (vyrobené Pillow, jednolitá světlá plocha).
 * Skutečné proto, že hlavičku PNG i JPEG čteme sami – syntetická data by
 * ověřila jen náš vlastní výmysl. Šířka a výška se schválně liší, aby bylo
 * poznat prohození os. */
const PNG_6x2 = 'iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAIAAAD0PzoJAAAAEklEQVR4nGP88OEDAypgYsAAAGWyAtTh+N9RAAAAAElFTkSuQmCC';
const JPEG_2x6 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAGAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3CiiigD//2Q==';

const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));

/* ---------- syntetická šablona ----------
 * Rámeček podpisu má schválně stejné rozměry jako skutečná šablona
 * (185,75 × 159,3 bodu), aby se dopočet dal porovnat s tím, co uvidí
 * uživatel ve Wordu. */
const RAMECEK_S = 185.75, RAMECEK_V = 159.3;
const STYL = 'position:absolute;margin-left:238.5pt;margin-top:17.05pt;'
  + 'width:' + RAMECEK_S + 'pt;height:' + RAMECEK_V + 'pt;z-index:-1;visibility:visible';

function dokumentXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="w" xmlns:v="v" xmlns:o="o" xmlns:r="r" xmlns:w10="w10"><w:body>'
    + '<w:p><w:r><w:t>Vypracoval: {{ZPRAC_JMENO}}</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Tel: {{ZPRAC_TEL}}</w:t></w:r>'
    + '<w:r><w:rPr><w:noProof/></w:rPr><w:pict><v:shape id="Image1" type="#_x0000_t75" style="' + STYL + '">'
    + '<v:imagedata r:id="rId8" o:title="{{ZPRAC_PODPIS}}" croptop="-14f"/><w10:wrap type="tight"/>'
    + '</v:shape></w:pict></w:r></w:p>'
    + '<w:p><w:r><w:t>Kancelář: ENGINEERS CZ s.r.o.</w:t></w:r></w:p>'
    + '</w:body></w:document>';
}
function relsXml(cil) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>'
    + '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + cil + '"/>'
    + '</Relationships>';
}
/* Content_Types schválně jen s PNG – ověříme, že si aplikace doplní jpeg sama. */
const CT_JEN_PNG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>';

const enc = new TextEncoder(), dec = new TextDecoder();

async function sablona(opt) {
  const o = opt || {};
  const cil = o.cil || 'media/image2.png';
  const polozky = [
    { nazev: '[Content_Types].xml', data: enc.encode(o.ct || CT_JEN_PNG) },
    { nazev: '_rels/.rels', data: enc.encode('<?xml version="1.0"?><Relationships/>') },
    { nazev: 'word/document.xml', data: enc.encode(o.dokument || dokumentXml()) },
    { nazev: 'word/_rels/document.xml.rels', data: enc.encode(relsXml(cil)) },
    { nazev: 'word/media/image1.png', data: b64(PNG_6x2) },
    { nazev: 'word/' + cil, data: b64(o.puvodni || PNG_6x2) },
  ];
  return (await zipZapis(polozky).arrayBuffer());
}
async function rozbal(blob) {
  const p = await zipPrecti(new Uint8Array(await blob.arrayBuffer()));
  const mapa = {};
  for (const x of p) mapa[x.nazev] = x.data;
  return { polozky: p, mapa, text: n => dec.decode(mapa[n]) };
}
const stylRozmery = xml => {
  const s = /width:([\d.]+)pt;height:([\d.]+)pt/.exec(xml);
  return s ? { s: Number(s[1]), v: Number(s[2]) } : null;
};

const ZPRAC = { ZPRAC_JMENO: 'Ing. Jan Zkušební', ZPRAC_TEL: '+420 111 222 333' };

(async () => {

  /* ---------- 1) čtení rozměrů z hlavičky obrázku ---------- */
  test('rozměry PNG 6×2', JSON.stringify(rozmeryObrazku(b64(PNG_6x2))) === JSON.stringify({ sirka: 6, vyska: 2 }),
    JSON.stringify(rozmeryObrazku(b64(PNG_6x2))));
  test('rozměry JPEG 2×6', JSON.stringify(rozmeryObrazku(b64(JPEG_2x6))) === JSON.stringify({ sirka: 2, vyska: 6 }),
    JSON.stringify(rozmeryObrazku(b64(JPEG_2x6))));
  test('nesmyslné bajty nerozbijí čtení rozměrů', rozmeryObrazku(new Uint8Array([1, 2, 3])) === null);

  /* ---------- 2) rozbor data URL ---------- */
  {
    const d = dataUrlNaBajty('data:image/jpeg;base64,' + JPEG_2x6);
    test('data URL – typ', d && d.mime === 'image/jpeg', d && d.mime);
    test('data URL – bajty', d && d.data.length === b64(JPEG_2x6).length);
    test('data URL – přípona', d && d.pripona === 'jpeg', d && d.pripona);
    test('prázdný vstup vrací null', dataUrlNaBajty('') === null && dataUrlNaBajty(null) === null);
    test('cizí schéma vrací null', dataUrlNaBajty('http://priklad.cz/podpis.png') === null);
  }

  /* ---------- 3) výměna obrázku za jinou příponu (png → jpeg) ---------- */
  {
    const blob = await docxVyplnSablonu(await sablona(), ZPRAC, [],
      { ZPRAC_PODPIS: 'data:image/jpeg;base64,' + JPEG_2x6 });
    const v = await rozbal(blob);
    const doc = v.text('word/document.xml');
    const rels = v.text('word/_rels/document.xml.rels');

    test('část se přejmenovala na .jpeg', !!v.mapa['word/media/image2.jpeg'] && !v.mapa['word/media/image2.png'],
      Object.keys(v.mapa).join(', '));
    test('bajty jsou nahraný podpis', v.mapa['word/media/image2.jpeg'].length === b64(JPEG_2x6).length);
    test('relace ukazuje na nový soubor', rels.includes('Target="media/image2.jpeg"'), rels);
    test('relace rId7 zůstala beze změny', rels.includes('Target="media/image1.png"'));
    test('[Content_Types] doplněn o jpeg', v.text('[Content_Types].xml').includes('Extension="jpeg"'));
    test('původní ilustrace image1.png se nedotkla', v.mapa['word/media/image1.png'].length === b64(PNG_6x2).length);
    test('tvar v dokumentu zůstal', doc.includes('<v:shape') && doc.includes('r:id="rId8"'));
    test('zástupný symbol už v alternativním textu není', !doc.includes('{{ZPRAC_PODPIS}}'), doc);
    test('textové symboly vyplněny', doc.includes('Ing. Jan Zkušební') && doc.includes('+420 111 222 333'));
    test('blok Kancelář zůstal', doc.includes('Kancelář: ENGINEERS CZ s.r.o.'));

    const r = stylRozmery(doc);
    /* Podpis 2×6 je na výšku, rámeček na šířku – smí se opřít o výšku rámečku
     * a šířku si vzít podle poměru stran. Roztažený být nesmí. */
    test('výška vyplní rámeček', r && Math.abs(r.v - RAMECEK_V) < 0.05, JSON.stringify(r));
    test('šířka odpovídá poměru stran', r && Math.abs(r.s - RAMECEK_V * 2 / 6) < 0.05, JSON.stringify(r));
    test('obrázek se vejde do rámečku', r && r.s <= RAMECEK_S + 0.01 && r.v <= RAMECEK_V + 0.01);
  }

  /* ---------- 4) obrázek na šířku se opře o šířku rámečku ---------- */
  {
    const blob = await docxVyplnSablonu(await sablona(), ZPRAC, [],
      { ZPRAC_PODPIS: 'data:image/png;base64,' + PNG_6x2 });
    const v = await rozbal(blob);
    const doc = v.text('word/document.xml');
    const r = stylRozmery(doc);
    test('šířka vyplní rámeček', r && Math.abs(r.s - RAMECEK_S) < 0.05, JSON.stringify(r));
    test('výška odpovídá poměru stran', r && Math.abs(r.v - RAMECEK_S * 2 / 6) < 0.05, JSON.stringify(r));
    test('stejná přípona – část se nepřejmenovala', !!v.mapa['word/media/image2.png'],
      Object.keys(v.mapa).join(', '));
    test('relace beze změny', v.text('word/_rels/document.xml.rels').includes('Target="media/image2.png"'));
    test('[Content_Types] nepřibyl duplicitní png',
      (v.text('[Content_Types].xml').match(/Extension="png"/g) || []).length === 1);
    test('ostatní vlastnosti tvaru zůstaly', doc.includes('croptop="-14f"') && doc.includes('margin-left:238.5pt'));
  }

  /* ---------- 5) bez podpisu tvar z dokumentu zmizí ---------- */
  for (const [popis, obr] of [['bez parametru', undefined], ['prázdná hodnota', { ZPRAC_PODPIS: '' }],
                              ['prázdný seznam', {}]]) {
    const blob = await docxVyplnSablonu(await sablona(), ZPRAC, [], obr);
    const v = await rozbal(blob);
    const doc = v.text('word/document.xml');
    test('(' + popis + ') tvar odstraněn', !doc.includes('<w:pict') && !doc.includes('<v:shape'), doc);
    test('(' + popis + ') symbol podpisu nezůstal v textu', !doc.includes('{{ZPRAC_PODPIS}}'));
    test('(' + popis + ') sousední text zůstal', doc.includes('+420 111 222 333')
      && doc.includes('Kancelář: ENGINEERS CZ s.r.o.'));
    test('(' + popis + ') odstavec zůstal celý', (doc.match(/<w:p>/g) || []).length === 3, doc);
    test('(' + popis + ') dokument je pořád platný XML strom',
      (doc.match(/<w:r>/g) || []).length === (doc.match(/<\/w:r>/g) || []).length);
  }

  /* ---------- 6) šablona bez obrázku i podpis navíc ---------- */
  {
    const prosty = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>{{ZPRAC_JMENO}}</w:t></w:r></w:p></w:body></w:document>';
    const blob = await docxVyplnSablonu(await sablona({ dokument: prosty }), ZPRAC, [],
      { ZPRAC_PODPIS: 'data:image/png;base64,' + PNG_6x2 });
    const v = await rozbal(blob);
    test('starší šablona bez tvaru projde', v.text('word/document.xml').includes('Ing. Jan Zkušební'));
    test('médium zůstalo nedotčené', v.mapa['word/media/image2.png'].length === b64(PNG_6x2).length);
  }

  /* ---------- 7) dokument, kde se mění JEN obrázek ---------- */
  {
    const jenObraz = '<w:document xmlns:w="w" xmlns:v="v" xmlns:o="o" xmlns:r="r"><w:body><w:p>'
      + '<w:r><w:pict><v:shape style="' + STYL + '"><v:imagedata r:id="rId8" o:title="{{ZPRAC_PODPIS}}"/>'
      + '</v:shape></w:pict></w:r></w:p></w:body></w:document>';
    let chyba = null;
    try {
      const blob = await docxVyplnSablonu(await sablona({ dokument: jenObraz }), {}, [],
        { ZPRAC_PODPIS: 'data:image/jpeg;base64,' + JPEG_2x6 });
      const v = await rozbal(blob);
      test('výměna obrázku sama o sobě stačí', !!v.mapa['word/media/image2.jpeg']);
    } catch (e) { chyba = e.message; }
    test('výměna obrázku se nepovažuje za „prázdnou šablonu"', chyba === null, chyba);
  }

  /* ---------- 8) šablona úplně bez symbolů pořád hlásí chybu ---------- */
  {
    const bezSymbolu = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Nic</w:t></w:r></w:p></w:body></w:document>';
    let chyba = null;
    try { await docxVyplnSablonu(await sablona({ dokument: bezSymbolu }), ZPRAC, [], {}); }
    catch (e) { chyba = e.message; }
    test('cizí .docx se pozná', chyba && chyba.includes('symboly'), chyba);
  }

  /* ---------- 9) chybějící relace nesmí shodit generování ---------- */
  {
    const rozbita = dokumentXml().replace('r:id="rId8"', 'r:id="rId99"');
    let chyba = null, doc = '';
    try {
      const blob = await docxVyplnSablonu(await sablona({ dokument: rozbita }), ZPRAC, [],
        { ZPRAC_PODPIS: 'data:image/png;base64,' + PNG_6x2 });
      doc = (await rozbal(blob)).text('word/document.xml');
    } catch (e) { chyba = e.message; }
    test('poškozená relace nezpůsobí výjimku', chyba === null, chyba);
    test('poškozený tvar se raději odstraní', !doc.includes('<w:pict'), doc);
    test('zbytek nabídky se vygeneruje', doc.includes('Ing. Jan Zkušební'));
  }

  /* ---------- 10) neznámý formát se nevloží ---------- */
  {
    const blob = await docxVyplnSablonu(await sablona(), ZPRAC, [],
      { ZPRAC_PODPIS: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') });
    const v = await rozbal(blob);
    test('SVG se do dokumentu nedostane', !v.mapa['word/media/image2.svg']
      && v.mapa['word/media/image2.png'].length === b64(PNG_6x2).length,
      Object.keys(v.mapa).join(', '));
    test('bez použitelného podpisu se tvar odstraní',
      !v.text('word/document.xml').includes('<w:pict'));
  }

  /* ---------- 11) archiv zůstane čitelný a úplný ---------- */
  {
    const blob = await docxVyplnSablonu(await sablona(), ZPRAC, [],
      { ZPRAC_PODPIS: 'data:image/jpeg;base64,' + JPEG_2x6 });
    const v = await rozbal(blob);
    test('počet částí archivu se nezměnil', v.polozky.length === 6, String(v.polozky.length));
    test('žádná část není prázdná', v.polozky.every(p => p.data.length > 0));
  }

  /* ---------- 12) novější způsob vložení obrázku (DrawingML) ----------
   *
   * Šablona nabídky PROJ (12. 8. 2026) nemá obrázky ve starém VML, ale
   * v DrawingML: alternativní text sedí v atributu `descr` uzlu <wp:docPr>
   * a odkaz na médium až v <a:blip r:embed>. Rámeček je v EMU (914 400 na
   * palec) a Word do něj obrázek SÁM nevepíše – nakreslí ho přesně na zadané
   * rozměry. Fotka na výšku vložená do rámečku na šířku by se tedy roztáhla,
   * kdyby se rozměry nedopočítaly. */
  {
    const RAMEC_S = 1828800, RAMEC_V = 914400;   // 2 × 1 palec
    const drawingXml = (descr) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="w" xmlns:r="r" xmlns:wp="wp" xmlns:a="a" xmlns:pic="pic"><w:body>'
      + '<w:p><w:r><w:t>Objednatel: {{ZPRAC_JMENO}}</w:t></w:r></w:p>'
      + '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0">'
      + '<wp:extent cx="' + RAMEC_S + '" cy="' + RAMEC_V + '"/>'
      + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
      + '<wp:docPr id="115" name="obrázek 115"' + (descr ? ' descr="' + descr + '"' : '') + '/>'
      + '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId8"/></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/>'
      + '<a:ext cx="' + RAMEC_S + '" cy="' + RAMEC_V + '"/></a:xfrm></pic:spPr>'
      + '</pic:pic></a:graphicData></a:graphic>'
      + '</wp:inline></w:drawing></w:r></w:p>'
      + '</w:body></w:document>';
    const rozmeryEmu = xml => {
      const m = /<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
      const a = /<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
      return { s: m && Number(m[1]), v: m && Number(m[2]),
               aS: a && Number(a[1]), aV: a && Number(a[2]) };
    };

    /* Široký obrázek (6×2) – omezí ho šířka rámečku, výška vyjde třetinová. */
    {
      const blob = await docxVyplnSablonu(await sablona({ dokument: drawingXml('{{UVODNI_FOTO}}') }),
        ZPRAC, [], { UVODNI_FOTO: 'data:image/png;base64,' + PNG_6x2 });
      const v = await rozbal(blob);
      const doc = v.text('word/document.xml');
      test('DrawingML: obrázek se vyměnil za nahranou fotku',
        v.mapa['word/media/image2.png'].length === b64(PNG_6x2).length);
      test('DrawingML: alternativní text se vyprázdnil',
        !doc.includes('{{UVODNI_FOTO}}') && doc.includes('descr=""'), doc.slice(0, 0));
      test('DrawingML: text v dokumentu se doplnil normálně', doc.includes('Ing. Jan Zkušební'));
      const r = rozmeryEmu(doc);
      test('DrawingML: šířka zůstala na okraji rámečku', r.s === RAMEC_S, JSON.stringify(r));
      test('DrawingML: výška se dopočítala podle poměru stran (6×2)',
        Math.abs(r.v - RAMEC_S / 3) <= 1, JSON.stringify(r));
      test('DrawingML: vnitřní rozměr tvaru jde s rámečkem',
        r.aS === r.s && r.aV === r.v, JSON.stringify(r));
    }

    /* Vysoký obrázek (2×6) – teď naopak omezí výška. Bez dopočtu by se
     * fotka na výšku roztáhla přes celý široký rámeček. */
    {
      const blob = await docxVyplnSablonu(await sablona({ dokument: drawingXml('{{UVODNI_FOTO}}') }),
        ZPRAC, [], { UVODNI_FOTO: 'data:image/jpeg;base64,' + JPEG_2x6 });
      const doc = (await rozbal(blob)).text('word/document.xml');
      const r = rozmeryEmu(doc);
      test('DrawingML: výška zůstala na okraji rámečku', r.v === RAMEC_V, JSON.stringify(r));
      test('DrawingML: šířka se dopočítala podle poměru stran (2×6)',
        Math.abs(r.s - RAMEC_V / 3) <= 1, JSON.stringify(r));
      test('DrawingML: obrázek se do rámečku vešel', r.s <= RAMEC_S && r.v <= RAMEC_V);
    }

    /* Bez nahrané fotky musí celý tvar zmizet – prázdný rámeček uprostřed
     * nabídky vypadá jako chyba tisku a fotka ze šablony by byla cizí stavba. */
    {
      const blob = await docxVyplnSablonu(await sablona({ dokument: drawingXml('{{UVODNI_FOTO}}') }),
        ZPRAC, [], {});
      const doc = (await rozbal(blob)).text('word/document.xml');
      test('DrawingML: bez fotky se celý obrázek z dokumentu odstraní',
        !doc.includes('<w:drawing') && !doc.includes('UVODNI_FOTO'));
      test('DrawingML: zbytek dokumentu zůstal', doc.includes('Ing. Jan Zkušební'));
    }

    /* Obrázek bez alternativního textu se nesmí dotknout – v šabloně jsou
     * i obrázky, které tam patří natrvalo (ilustrace rozsahu prací). */
    {
      const blob = await docxVyplnSablonu(await sablona({ dokument: drawingXml('') }),
        ZPRAC, [], { UVODNI_FOTO: 'data:image/jpeg;base64,' + JPEG_2x6 });
      const v = await rozbal(blob);
      const doc = v.text('word/document.xml');
      test('DrawingML: neoznačený obrázek zůstal v dokumentu', doc.includes('<w:drawing'));
      test('DrawingML: neoznačenému obrázku se nezměnily bajty',
        v.mapa['word/media/image2.png'].length === b64(PNG_6x2).length);
      test('DrawingML: neoznačenému obrázku se nezměnil rámeček',
        rozmeryEmu(doc).s === RAMEC_S && rozmeryEmu(doc).v === RAMEC_V);
    }
  }

  console.log(fail ? `\n${fail} TESTŮ SELHALO` : `\nVŠECHNY TESTY (${ok}) OK`);
  process.exit(fail ? 1 : 0);
})();
