/* ============================================================
 * SEZNAM ZÁKAZNÍKŮ (#162, 20. 8. 2026)
 *
 * PROČ TAHLE SADA
 * Databáze zákazníků má jediný smysl: nepsat totéž podruhé. Tím se ale
 * otevírají tři způsoby, jak si nadělat škodu — a přesně ty tu hlídáme:
 *
 *  1) DVĚ KARTY PRO JEDNU FIRMU. Klíč se počítá z IČO; „248 348 82"
 *     a „24834882" musí být tentýž zákazník, jinak vznikne druhá karta
 *     a půlka údajů skončí v té špatné.
 *  2) KARTA PŘEPÍŠE ZAKÁZKU. Prázdné pole karty nesmí vymazat, co je
 *     v zakázce vyplněné („prázdno není nula" platí i tady).
 *  3) ZAKÁZKA PŘEPÍŠE KARTU POTICHU. Rozdíly se jen NABÍZEJÍ; zapsat je
 *     smí až potvrzení člověkem. Jedna překlepnutá zakázka by jinak
 *     rozbila údaje všem ostatním.
 * ============================================================ */
const Z = require('./zakaznici.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* ---------- 1) klíč a duplicity ---------- */

const svj = Z.zakaznikNovy();
svj.nazev = 'Společenství vlastníků jednotek Verdunská 983, Praha 6';
svj.ico = '24834882';
svj.sidlo = 'Verdunská 983/29, Bubeneč, 16000 Praha 6';

test('klíčem je IČO', Z.zakaznikKlic(svj) === '24834882', Z.zakaznikKlic(svj));
test('mezery a tečky v IČO klíč nemění',
  Z.zakaznikKlic({ ico: ' 248 348 82 ' }) === '24834882');
test('očista IČO uloží bez mezer',
  Z.zakaznikOciste({ nazev: 'A', ico: '248 348 82' }, 'a@b.cz', '2026-08-20').ico === '24834882');
test('bez IČO se klíč složí z názvu a pozná se předponou',
  Z.zakaznikKlic({ nazev: 'Bytové družstvo Zkušební' }) === 'n-bytove-druzstvo-zkusebni',
  Z.zakaznikKlic({ nazev: 'Bytové družstvo Zkušební' }));
test('zákazník bez názvu i bez IČO klíč nemá (nedá se uložit)',
  Z.zakaznikKlic({}) === '');

/* Podobný název se hlásí, ale nikdy neblokuje — rozhodnutí je na člověku. */
const seznam = [svj];
const podobny = Z.zakaznikNovy();
podobny.nazev = 'SVJ Verdunská 983, Praha 6';
test('podobný název se ohlásí', Z.zakazniciPodobni(seznam, podobny).length === 1);
test('sám sebe za duplicitu nepovažuje', Z.zakazniciPodobni(seznam, svj).length === 0);
test('úplně jiná firma se nehlásí',
  Z.zakazniciPodobni(seznam, { nazev: 'Stavby Novák s.r.o.' }).length === 0);

/* ---------- 2) hledání ---------- */

const seznam3 = [svj,
  Object.assign(Z.zakaznikNovy(), { nazev: 'Stavby Novák s.r.o.', ico: '87654321', sidlo: 'Brno' }),
  Object.assign(Z.zakaznikNovy(), { nazev: 'Bytové družstvo Zkušební', sidlo: 'Zkušebín' })];
test('hledá se podle názvu bez ohledu na diakritiku',
  Z.zakazniciHledej(seznam3, 'verdunska').length === 1);
test('hledá se i podle IČO', Z.zakazniciHledej(seznam3, '8765').length === 1);
test('hledá se i podle města', Z.zakazniciHledej(seznam3, 'Brno').length === 1);
test('prázdný dotaz vrátí všechny', Z.zakazniciHledej(seznam3, '').length === 3);
test('nesmysl nevrátí nic', Z.zakazniciHledej(seznam3, 'xyzxyz').length === 0);

/* ---------- 3) karta → zakázka ---------- */

const karta = Z.zakaznikNovy();
karta.nazev = 'Zkušební ocelárna s.r.o.';
karta.ico = '12345679';
karta.sidlo = 'Sídlištní 2, Zkušebín';
karta.smluvniJmeno = 'Ing. Petr Sedlák';
karta.smluvniPozice = 'předseda výboru';
karta.technickyEmail = 'technik@zkusebni.cz';

const zak = { objednatel: '', ico: '', adresaObjednatele: 'STARÁ ADRESA', zastupci: {} };
const zmen = Z.zakaznikDoZakazky(karta, zak);
test('karta vyplní hlavičku i zástupce',
  zak.objednatel === 'Zkušební ocelárna s.r.o.' && zak.ico === '12345679'
  && zak.zastupci.smluvniJmeno === 'Ing. Petr Sedlák'
  && zak.zastupci.technickyEmail === 'technik@zkusebni.cz', JSON.stringify(zak));
test('přepíše i to, co v zakázce bylo jinak', zak.adresaObjednatele === 'Sídlištní 2, Zkušebín');
test('vrací počet změněných polí', zmen === 6, zmen);
test('zakázka si zapamatuje, ze které karty pochází', zak.zakaznikId === '12345679');

/* Prázdné pole karty nikdy nic nemaže — jinak by přenesení zákazníka
 * vygumovalo kontakt, který si obchodník k té zakázce zvlášť dohledal. */
const zak2 = { objednatel: 'X', zastupci: { obchodniTel: '+420 601 000 111' } };
Z.zakaznikDoZakazky(karta, zak2);
test('prázdné pole karty nevymaže hodnotu v zakázce',
  zak2.zastupci.obchodniTel === '+420 601 000 111');

/* ---------- 4) zakázka → karta (jen na potvrzení) ---------- */

zak.zastupci.obchodniJmeno = 'Jana Malá';
zak.zastupci.smluvniPozice = 'jednatel';        // v zakázce se změnila pozice
const rozdily = Z.zakaznikRozdily(karta, zak);
test('rozdíl se najde a nese starou i novou hodnotu',
  rozdily.some(r => r.id === 'smluvniPozice' && r.karta === 'předseda výboru' && r.zakazka === 'jednatel'),
  JSON.stringify(rozdily));
test('nové vyplnění v zakázce se hlásí taky',
  rozdily.some(r => r.id === 'obchodniJmeno' && r.karta === '' && r.zakazka === 'Jana Malá'));
test('shodná pole se nehlásí', !rozdily.some(r => r.id === 'nazev'));
/* Prázdné pole v zakázce není změna: nevyplnění neznamená „smaž to v kartě". */
const zakPrazdny = { objednatel: '', zastupci: {} };
test('prázdná zakázka nehlásí žádné rozdíly',
  Z.zakaznikRozdily(karta, zakPrazdny).length === 0);

/* Samotné porovnání kartu NEMĚNÍ — zápis dělá až zakaznikPrevezmi. */
test('porovnání kartu nezmění', karta.smluvniPozice === 'předseda výboru');
const po = Z.zakaznikPrevezmi(JSON.parse(JSON.stringify(karta)), rozdily);
test('po potvrzení karta hodnoty převezme',
  po.smluvniPozice === 'jednatel' && po.obchodniJmeno === 'Jana Malá');

/* ---------- 5) karta z otevřené zakázky ---------- */

const zKar = Z.zakaznikZeZakazky({ objednatel: 'Nový zákazník', ico: '11122233',
  kontakt: 'Jan Novák', zastupci: { banka: 'KB', technickyTel: '+420 602 000 000' } });
test('karta se dá založit z otevřené zakázky',
  zKar.nazev === 'Nový zákazník' && zKar.ico === '11122233'
  && zKar.kontaktOsoba === 'Jan Novák' && zKar.banka === 'KB'
  && zKar.technickyTel === '+420 602 000 000');

/* ---------- 6) očista přijatého záznamu ---------- */

const spinavy = Z.zakaznikOciste({ nazev: 'A', ico: '12345679', necoCizi: 'sem nepatří',
  poznamka: 'x'.repeat(5000), smluvniJmeno: 'y'.repeat(500) }, 'kdo@x.cz', '2026-08-20T10:00:00Z');
test('neznámý klíč se zahodí', spinavy.necoCizi === undefined);
test('dlouhé hodnoty se ořežou',
  spinavy.poznamka.length === 2000 && spinavy.smluvniJmeno.length === 300);
test('očista doplní autora a čas úpravy',
  spinavy.autor === 'kdo@x.cz' && spinavy.upraven === '2026-08-20T10:00:00Z');
test('karta nenese pole Scoring Cribis (20. 8. 2026 vyřazeno)',
  !Object.keys(Z.zakaznikNovy()).some(k => /scoring|cribis/i.test(k))
  && !Z.ZAKAZNIK_POLE.some(p => /scoring|cribis/i.test(p.id + p.label)));

/* ---------- 7) definice polí ---------- */

test('každé pole má id, popisek a jeden cíl v zakázce',
  Z.ZAKAZNIK_POLE.every(p => p.id && p.label && ((p.zak ? 1 : 0) + (p.zast ? 1 : 0) === 1)),
  JSON.stringify(Z.ZAKAZNIK_POLE.find(p => !p.id || !p.label || ((p.zak ? 1 : 0) + (p.zast ? 1 : 0) !== 1))));
const ids = Z.ZAKAZNIK_POLE.map(p => p.id);
test('id polí jsou unikátní', new Set(ids).size === ids.length);
/* Telefon a e-mail mají vlastní pole (pravidlo z 20. 8. 2026) — kdyby se
 * někdy slily do jednoho, nedaly by se proklikat ani vytřídit. */
test('telefon a e-mail jsou všude oddělené',
  ['smluvni', 'obchodni', 'technicky', 'faktury'].every(k =>
    ids.includes(k + 'Tel') && ids.includes(k + 'Email')));


/* ---------- výběr firmy našeptávačem: kontakty a předvyplnění (22. 8. 2026) ---------- */
{
  const k1 = Z.zakaznikNovy(); k1.nazev = 'Jedna s.r.o.'; k1.ico = '12345678'; k1.kontaktOsoba = 'Jan Jediný';
  test('kontakty: jedno jméno', Z.zakaznikKontakty(k1).length === 1 && Z.zakaznikKontakty(k1)[0].jmeno === 'Jan Jediný');
  const k3 = Z.zakaznikNovy(); k3.nazev = 'Tři s.r.o.'; k3.ico = '87654321'; k3.dic = 'CZ87654321'; k3.sidlo = 'Ulice 1';
  k3.kontaktOsoba = 'Karel Kontakt'; k3.smluvniJmeno = 'Karel Kontakt'; k3.smluvniTel = '+420 1'; k3.obchodniJmeno = 'Olga Obchod'; k3.technickyJmeno = 'Tomáš Technik';
  const kk = Z.zakaznikKontakty(k3);
  test('kontakty: tři různá jména, shodné jméno se slije s rolí', kk.length === 3 && /kontaktní osoba, ve věcech smluvních/.test(kk[0].role) && kk[0].tel === '+420 1', JSON.stringify(kk));
  const zak1 = { objednatel: '', ico: '', dic: '', adresaObjednatele: '', kontakt: '' };
  const v1 = Z.zakaznikPredvypln(k1, zak1);
  test('předvyplnění: jedno jméno → kontakt se vyplní, IČO taky', zak1.kontakt === 'Jan Jediný' && zak1.ico === '12345678' && v1.kontakty.length === 0 && zak1.zakaznikId === Z.zakaznikKlic(k1));
  const zak3 = { objednatel: '', ico: '', dic: '', adresaObjednatele: '', kontakt: '' };
  const v3 = Z.zakaznikPredvypln(k3, zak3);
  test('předvyplnění: více jmen → kontakt zůstane prázdný a vrátí se k výběru', zak3.kontakt === '' && v3.kontakty.length === 3 && zak3.ico === '87654321' && zak3.dic === 'CZ87654321' && zak3.adresaObjednatele === 'Ulice 1');
  const zak4 = { objednatel: 'Jiné jméno', ico: '11111111', dic: '', adresaObjednatele: '', kontakt: 'Ručně Zadaný' };
  Z.zakaznikPredvypln(k1, zak4);
  test('předvyplnění: vyplněná pole hlavičky se nepřepisují (zakázka je pán)', zak4.ico === '11111111' && zak4.kontakt === 'Ručně Zadaný' && zak4.objednatel === 'Jiné jméno');
  test('předvyplnění: bez karty nic nepadá', Z.zakaznikPredvypln(null, zak4).zmeny.length === 0);
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
