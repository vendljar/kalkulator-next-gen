#!/usr/bin/env bash
# Spustí VŠECHNY testovací sady a vypíše souhrn.
#
# Proč existuje tenhle skript a nestačí jednořádkový příkaz:
# dřív se v návodu psalo `for f in src/test_*.js; do node "$f"; done`. Ten glob
# ale MÍJÍ soubor `src/test.js` – tedy 41 testů shody s Excelem, právě tu sadu,
# která hlídá, že se výsledky kalkulace nerozejdou se šablonou VZOR. Rozbití
# jádra tak mohlo projít „zelenými" testy. Skript proto pouští test.js zvlášť
# a k tomu všechno ostatní, co odpovídá test_*.js – nové sady se přidají samy.
#
# Použití:  ./spust_testy.sh          (z kořene archivu)
#           ./spust_testy.sh --smoke  (navíc kouřový test v prohlížeči)
# Návratový kód 0 = všechno prošlo.
#
# Kouřový test (smoke.mjs) otevře sestavený dist/kalkulacka.html v Chromiu a
# ověří to, co Node sady nevidí – že bundle vůbec nastartuje. Je dobrovolný,
# protože potřebuje playwright a hotový build; bez něj by skript hlásil chybu
# i tam, kde jde jen o změnu v jádře.

set -u
cd "$(dirname "$0")/src" || exit 1

selhalo=0
proslo=0
preskoceno=0
seznam_selhani=()
seznam_preskocenych=()

# Návratový kód 3 = sada se PŘESKOČILA, protože potřebuje skutečný ceník,
# který v repozitáři záměrně není (viz src/zkusebni_data.js). Není to chyba
# kódu, takže se to nepočítá jako selhání – ale ani jako „prošlo", aby se
# nezdálo, že shodu s Excelem někdo ověřil.
spust() {
  local f="$1"
  node "$f" > /tmp/kng_test_out.txt 2>&1
  local kod=$?
  if [ "$kod" -eq 0 ]; then
    proslo=$((proslo + 1))
    printf '  ✓ %s\n' "$f"
  elif [ "$kod" -eq 3 ]; then
    preskoceno=$((preskoceno + 1))
    seznam_preskocenych+=("$f")
    printf '  – %s (přeskočeno – chybí skutečný ceník)\n' "$f"
  else
    selhalo=$((selhalo + 1))
    seznam_selhani+=("$f")
    printf '  ✗ %s\n' "$f"
    sed 's/^/      /' /tmp/kng_test_out.txt
  fi
}

echo "Testy jádra (shoda s Excelem):"
spust test.js

echo "Ostatní sady:"
for f in test_*.js; do
  [ -e "$f" ] || continue
  spust "$f"
done

# Serverové sady (netlify/test_*.mjs) běží proti náhradnímu úložišti v paměti
# a náhradnímu `fetch`, takže nepotřebují ani Netlify, ani síť. Do 9. 8. 2026
# se pouštěly ručně — a nová sada se tím pádem mohla klidně měsíc nespustit.
# Mutační testování (netlify/mutace.mjs) tu schválně NENÍ: trvá přes minutu
# a pouští tyhle sady znovu, takže patří do samostatného běhu.
echo "Serverové sady (online databáze a napojení na CRM):"
for f in ../netlify/test_*.mjs; do
  [ -e "$f" ] || continue
  spust "$f"
done

if [ "${1:-}" = "--smoke" ]; then
  echo "Kouřový test v prohlížeči:"
  if [ ! -f ../dist/kalkulacka.html ]; then
    echo "  – přeskočeno: chybí dist/kalkulacka.html (spusťte python3 build.py)"
  else
    ( cd .. && NODE_PATH="$(npm root -g 2>/dev/null)" node smoke.mjs ) > /tmp/kng_smoke_out.txt 2>&1
    kod=$?
    if [ "$kod" -eq 0 ]; then
      proslo=$((proslo + 1)); printf '  ✓ %s\n' "smoke.mjs"
    elif [ "$kod" -eq 2 ]; then
      echo "  – přeskočeno: playwright není nainstalovaný (npm i -g playwright)"
    else
      selhalo=$((selhalo + 1)); seznam_selhani+=("smoke.mjs"); printf '  ✗ %s\n' "smoke.mjs"
      sed 's/^/      /' /tmp/kng_smoke_out.txt
    fi
  fi
fi

echo
echo "Souhrn: $proslo prošlo, $selhalo selhalo, $preskoceno přeskočeno (celkem $((proslo + selhalo + preskoceno)) sad)."
if [ "$preskoceno" -gt 0 ]; then
  echo "Přeskočeno: ${seznam_preskocenych[*]}"
  echo "  (potřebují skutečný ceník mimo repozitář – návod vypíše sada sama)"
fi
if [ "$selhalo" -gt 0 ]; then
  echo "Selhalo: ${seznam_selhani[*]}"
  exit 1
fi
echo "Vše v pořádku – můžete sestavit build (python3 build.py)."
