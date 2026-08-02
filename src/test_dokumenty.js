/* Test dokumenty.js – jednotný registr dokumentů.
   Ověří registraci, dokumentVygeneruj a shodu s přímým docxVyplnSablonu.
   Použití: node test_dokumenty.js /cesta/k/Sablona_NABIDKA_CN_v3.docx */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const fm = require('./firma.js');   // SET-3 – firemní údaje musí být globální dřív než nabidka.js
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const docx = require('./docxgen.js');
global.docxVyplnSablonu = docx.docxVyplnSablonu;
// registr musí být k dispozici dřív, než se načte nabidka.js (ta se registruje)
const dokM = require('./dokumenty.js');
global.dokumentRegistruj = dokM.dokumentRegistruj;
const { nabidkaData } = require('./nabidka.js');
const { dokumentVygeneruj, dokumentDef, dokumentTypy } = dokM;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

// 1) registrace nabídky proběhla
test('nabidka je registrována', dokumentDef('nabidka') != null);
test('registr obsahuje typ nabidka', dokumentTypy().includes('nabidka'));
test('neznámý typ = null', dokumentDef('neexistuje') === null);

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9001'; zak.objednatel = 'Vzorový odběratel s.r.o.'; zak.kontakt = 'Ing. Jan Vzorový';
zak.adresa = 'Vzorová 163/17, Praha 10'; zak.datum = '2026-04-21';
zak.varianty[0].data.ock.fixes = true;
const v = zak.varianty[0];

(async () => {
  const tplPath = process.argv[2];
  if (tplPath && fs.existsSync(tplPath)) {
    const buf = fs.readFileSync(tplPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    // 2) dokumentVygeneruj('nabidka') vrátí blob + název
    const res = await dokumentVygeneruj('nabidka', ab.slice(0), zak, v, JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8')));
    const bytes = new Uint8Array(await res.blob.arrayBuffer());
    test('výstup je ZIP (PK signatura)', bytes[0] === 0x50 && bytes[1] === 0x4B, [bytes[0], bytes[1]].join(','));
    test('název souboru dle CN', /NABÍDKA_2026-OPR-CN-9001/.test(res.nazevSouboru), res.nazevSouboru);

    // 3) shoda s přímým docxVyplnSablonu (stejná délka výstupu)
    const jekly = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
    const d = nabidkaData(zak, v, jekly);
    const primo = new Uint8Array(await (await docx.docxVyplnSablonu(ab.slice(0), d.placeholders, d.priplatky)).arrayBuffer());
    test('shoda délky s přímým voláním (regrese)', Math.abs(primo.length - bytes.length) < 8, primo.length + ' vs ' + bytes.length);
  } else {
    console.log('   (přeskočeno generování – šablona nezadána; testuji jen registr)');
  }
  console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY DOKUMENTY OK');
  process.exit(fail ? 1 : 0);
})();
