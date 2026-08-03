# Nasazení serveru na rosti.cz (z GitHubu)

1. V administraci rosti.cz založit aplikaci typu **Node.js** (nejmenší tarif stačí).
2. Jako zdroj nasazení zvolit **Git** a zadat adresu GitHub repozitáře
   (rosti si repozitář stáhne; u soukromého repozitáře nabídne deploy klíč,
   který se vloží na GitHubu do Settings → Deploy keys).
3. Spouštěcí příkaz: `node server/server.js` (port si rosti předá proměnnou PORT).
4. Kontrola: otevřít `https://<adresa>/api/zdravi` — musí odpovědět `{ ok: true, verze: … }`,
   a `https://<adresa>/` — musí se otevřít kalkulačka.

5. Sestavená aplikace (dist/) do repozitáře záměrně nepatří — hned po
   nasazení proto kořen webu ukáže jen stavovou stránku serveru. Doplnění
   aplikace na server je součást dokončení K3 (spolu s přihlašováním);
   pro ověření nasazení z GitHubu stačí, že /api/zdravi odpovídá.

Pozor: repozitář nese ceníky vynulované (tak je to správně). Server proto
zatím počítá jen z dat poslaných v požadavku; napojení na databázi s ostrým
ceníkem přijde v dalším kroku (K3 dokončení + K4 import _DB).
