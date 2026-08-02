/* ============================================================
 * PŘEKLADY – jazykové mutace CZ / EN / DE / FR  (úkol N1)
 * Zdroje slovníku:
 *   – EngineersCZ_Vocabulary_3_Fable.xlsx, list „Vocab" (CZ/EN/DE/FR)
 *   – TechSpec_CZENDE_3_Fable.xlsx, list „CHECKLIST SMLOUVA" (CZ/EN/DE)
 *   – tamtéž listy „_data add struct elem" a „_out of scope" (CZ/EN)
 * Formát: klíč = český originál, hodnota = [EN, DE, FR]; prázdný řetězec
 * znamená „zatím nepřeloženo" – tr() v takovém případě vrátí češtinu
 * a heslo se zapíše do PREKLAD_CHYBI (podklad pro překladatele).
 * Slovník je určen k uložení do konfigurace.json (SET-2 / úkol N3),
 * takže se dá doplňovat bez zásahu do kódu.
 * ============================================================ */

const JAZYKY = [
  { kod: 'cz', nazev: 'Čeština', vlajka: 'CZ' },
  { kod: 'en', nazev: 'English', vlajka: 'EN' },
  { kod: 'de', nazev: 'Deutsch', vlajka: 'DE' },
  { kod: 'fr', nazev: 'Français', vlajka: 'FR' },
];
const JAZYK_IDX = { en: 0, de: 1, fr: 2 };

/* klíč = český originál, hodnota = [EN, DE, FR] */
const PREKLAD = {

  /* ---- doplněno ručně (obecná slova, která ve zdrojových tabulkách nebyla) ---- */
  "ano": ["yes", "ja", "oui"],
  "ne": ["no", "nein", "non"],
  /* obchodní část nabídky – běžné výrazy, ne odborná terminologie */
  "množství": ["quantity", "Menge", "quantité"],
  "v základní ceně": ["included in the base price", "im Grundpreis enthalten", "inclus dans le prix de base"],
  "je součástí dodávky": ["included in the delivery", "im Lieferumfang enthalten", "inclus dans la livraison"],
  "není součástí nabídky": ["not included in the offer", "nicht im Angebot enthalten", "non inclus dans l'offre"],
  "snížená": ["reduced", "ermäßigt", "réduit"],
  "základní": ["standard", "Regelsatz", "normal"],

  /* ---- hesla používaná aplikací ---- */
  "** parametry profilů se mohou změnit po zpracování statického posouzení": ["** Beam size may differ based on final static calculation of all structure.", "** Die Trägergröße kann je nach endgültiger statischer Berechnung der gesamten Konstruktion abweichen.", "** La dimension des profilés peut être modifiée selon le calcul statique final de toute la structure."],
  "4x rohový sloupek, ocelový uzavřený profil": ["4 corner columns, closed profile", "4 Eckstiele, geschlossenes Stahlprofil", "4 montants d’angle, profilé creux en acier"],
  "bez světlíků": ["Without glass portals", "ohne Oberlichter", "sans impostes vitrées"],
  "bezúplatně zajistí majitel objektu": ["by building owner (no extra cost)", "durch den Gebäudeeigentümer (ohne Aufpreis)", "par le propriétaire du bâtiment (sans frais)"],
  "CELKOVÁ VÝŠKA KONSTRUKCE [m] *": ["TOTAL HEIGHT [m] *", "GESAMTHÖHE [m] *", "HAUTEUR TOTALE [m] *"],
  "DEMONTÁŽ PORTÁLŮ": ["LANDING ENTRANCE DISMANTLING", "DEMONTAGE DES PODESTEINGANGS", "DÉMONTAGE DES PORTAILS DE PALIER"],
  "DEMONTÁŽ PŮVODNÍHO OHRAZENÍ": ["ORIGINAL SHAFT DISMANTLING", "DEMONTAGE DES ORIGINALSCHACHTS", "DÉMONTAGE DE L’ANCIENNE ENCEINTE DE GAINE"],
  "DEMONTÁŽ PŮVODNÍHO VÝTAHU": ["ORIGINAL LIFT DISMANTLING", "DEMONTAGE DES ORIGINALAUFZUGS", "DÉMONTAGE DE L’ANCIEN ASCENSEUR"],
  "Diagonálně průchozí kabina": ["Corner entry through-type car", "Kabine mit Eckzugang", "Cabine traversante en diagonale"],
  "dokrytí lakovaným plechem": ["Covered with painted metal sheet", "verkleidet mit lackiertem Metallblech", "recouvrement en tôle laquée"],
  "DOLNÍ PŘEJEZD [mm]": ["PIT [mm]", "SCHACHTGRUBE [mm]", "Fosse [mm]"],
  "DOPLŇKOVÉ KONSTRUKCE": ["ADDITIONAL STRUCTURAL ELEMENTS", "ZUSÄTZLICHE STRUKTURELEMENTE", "ÉLÉMENTS DE STRUCTURE SUPPLÉMENTAIRES"],
  "DOZDĚNÍ KOLEM ŠACHETNÍCH DVEŘÍ": ["CONSTRUCTION WORK ON LANDING DOOR","BAUARBEITEN AN DER SCHACHTTÜR","TRAVAUX DE MAÇONNERIE AUTOUR DES PORTES PALIÈRES"],
  "HORNÍ PŘEJEZD [mm]": ["OVERHEAD [mm]", "SCHACHTKOPF [mm]", "Hauteur libre supérieure [mm]"],
  "HÁKY PRO ČIŠTĚNÍ ŠACHTY": ["LIFTING HOOKS FOR SHAFT CLEANING", "HEBEHAKEN FÜR DIE SCHACHTREINIGUNG", "CROCHETS DE LEVAGE POUR NETTOYAGE DE LA GAINE"],
  "je součástí dodávky pouze po dobu stavby šachty": ["In scope of shaft delivery – for period of shaft installation only","Im Umfang der Schachtlieferung - nur für den Zeitraum der Schachtmontage","Compris dans la fourniture de la gaine – uniquement pendant le montage de la gaine"],
  "KONSTRUKČNÍ ŘEŠENÍ ŠACHTY": ["SHAFT SOLUTION", "SCHACHTGERÜST-LÖSUNG", "SOLUTION DE LA GAINE"],
  "kontaktní, přes chemické kotvy do zdiva": ["Contact, with chemical anchors", "Kontakt, mit chemischen Ankern", "contact, ancrages chimiques dans la maçonnerie"],
  "KOTVENÍ KONSTRUKCE (POLOHA)": ["ANCHORING POSITION", "VERANKERUNG (POSITION)", "POSITION DE L’ANCRAGE"],
  "KOTVENÍ KONSTRUKCE (TYP)": ["ANCHORING TYPE", "VERANKERUNG (ART)", "TYPE D’ANCRAGE"],
  "lesklý ochranný lak v barvě RAL dle výběru objednatele": ["Glossy painting in RAL colour of customer's choice", "Glänzender Schutzlack in RAL-Farbe nach Wahl des Kunden", "laque de protection brillante, teinte RAL au choix du client"],
  "LEŠENÍ - UVNITŘ ŠACHTY": ["SCAFFOLDING - INSIDE SHAFT STRUCTURE", "GERÜST - INNERHALB DES SCHACHTS", "ÉCHAFAUDAGE – À L’INTÉRIEUR DE LA GAINE"],
  "LEŠENÍ - VNĚ ŠACHTY": ["SCAFFOLDING - OUTSIDE SHAFT STRUCTURE", "GERÜST - AUSSERHALB DES SCHACHTBAUWERKS", "ÉCHAFAUDAGE – À L’EXTÉRIEUR DE LA GAINE"],
  "MATERIÁL OPLÁŠTĚNÍ": ["CLADDING MATERIAL", "VERKLEIDUNGSMATERIAL", "MATÉRIAU DE L’HABILLAGE"],
  "materiály DP1, opláštění bez deklarované požární odolnosti": ["Steel structure DP1, cladding without declared fire resistance", "Stahlkonstruktion DP1, Verkleidung ohne deklarierten Feuerwiderstand", "structure en acier DP1, habillage sans résistance au feu déclarée"],
  "montovaná, průběžná": ["Mounted, continuous", "montiert, durchgehend", "montée (assemblée), continue"],
  "MONTÁŽNÍ NOSNÍK NEBO OKA": ["INSTALLATION BEAM OR LIFTING EYE","MONTAGEBALKEN ODER HEBEHAKEN","POUTRE DE MONTAGE OU ANNEAUX DE LEVAGE"],
  "na dně prohlubně výtahové šachty": ["On the shaft pit floor", "Auf der Schachtgrubensohle", "au fond de la fosse de la gaine"],
  "Na horním nosném rámu OCK": ["On the top frame of the steel structure","Auf dem oberen Rahmen der Stahlkonstruktion","Sur le cadre supérieur de la structure métallique"],
  "na zasklívací terče": ["Glazing fixing points", "Befestigungspunkte der Verglasung", "sur pastilles de vitrage"],
  "na zpevněné hraně stěn prohlubně výtahové šachty": ["on the reinforced pit edge", "Am verstärkten Grubenrand", "sur le bord renforcé de la fosse"],
  "NAPOJENÍ ŠACHETNÍCH DVEŘÍ": ["LANDING DOOR COVER PLATE", "SCHACHTTÜR-ABDECKPLATTE", "TÔLE DE RECOUVREMENT DES PORTES PALIÈRES"],
  "neprůchozí kabina": ["Single entrance car", "Kabine mit einem Eingang", "Cabine à entrée simple"],
  "NUCENÉ VĚTRÁNÍ ŠACHTY VENTILÁTOREM": ["VENTILATION FAN IN THE SHAFT","ZWANGSBELÜFTUNG DES SCHACHTS MIT VENTILATOR","VENTILATION FORCÉE DE LA GAINE PAR VENTILATEUR"],
  "ODBĚRNÉ MÍSTO EL. ENERGIE PO DOBU REALIZACE": ["ELECTRIC POWER LINE FOR INSTALLATION", "STROMLEITUNG FÜR DIE INSTALLATION", "ALIMENTATION ÉLECTRIQUE POUR LE MONTAGE"],
  "ODVĚTRÁNÍ ŠACHTY": ["SHAFT VENTILATION","SCHACHTBELÜFTUNG","VENTILATION DE LA GAINE"],
  "OHRAZENÍ ŠACHTY PROTI PÁDU": ["SAFETY BARRIER AROUND SHAFT","SICHERHEITSBARRIERE UM DEN SCHACHT","BARRIÈRE DE SÉCURITÉ AUTOUR DE LA GAINE"],
  "OPLÁŠTĚNÍ NADSVĚTLÍKŮ": ["TRANSOM PANEL CLADDING (ABOVE ENTRANCE)", "OBERLICHT-VERKLEIDUNG (ÜBER DEM EINGANG)", "HABILLAGE DES IMPOSTES (AU-DESSUS DE L’ENTRÉE)"],
  "OPLÁŠTĚNÍ PORTÁLŮ NÁSTUPIŠŤ": ["LANDING DOOR ENTRANCE CLADDING", "VERKLEIDUNG DER EINGANGSPORTALE", "HABILLAGE DES PORTAILS DE PALIER"],
  "OPLÁŠTĚNÍ ČELA POD NÁSTUPIŠTĚM": ["FRONT CLADDING BELOW LANDINGS", "VERKLEIDUNG DER FRONT UNTER DEN ZUGANGSSTELLEN", "HABILLAGE DE LA FAÇADE SOUS LES PALIERS"],
  "OPLÁŠTĚNÍ ŠACHTY": ["SHAFT CLADDING", "SCHACHTAUSKLEIDUNG", "HABILLAGE DE LA GAINE"],
  "OSVĚTLENÍ NÁSTUPIŠŤ": ["LANDING LIGHTS","BELEUCHTUNG DER ZUGANGSSTELLEN","ÉCLAIRAGE DES PALIERS"],
  "OVĚŘOVACÍ STATICKÝ VÝPOČET KONSTRUKCE": ["STATIC CALCULATION", "STATISCHE BERECHNUNGEN", "CALCUL STATIQUE DE VÉRIFICATION"],
  "plnostěnné": ["Full wall","Vollwand","Plein"],
  "PODCHOZÍ NOSNÁ OCK": ["SUPPORT FOR OPEN SPACE UNDER SHAFT", "STÜTZE FÜR DEN FREIRAUM UNTER DEM SCHACHT", "STRUCTURE PORTEUSE POUR ESPACE LIBRE SOUS LA GAINE"],
  "POVRCHOVÁ ÚPRAVA OPLÁŠTĚNÍ": ["CLADDING FINISHING", "OBERFLÄCHENBEHANDLUNG DER VERKLEIDUNG", "FINITION DE L’HABILLAGE"],
  "POČET STANIC / NÁSTUPIŠŤ": ["NUMBER OF STOPS / LANDINGS", "ANZAHL DER HALTESTELLEN / ZUGANGSSTELLEN", "Nombre d’arrêts / de paliers"],
  "POŽÁRNÍ KLASIFIKACE KONSTRUKCE": ["FIRE CLASS", "BRANDKLASSE", "CLASSE DE RÉACTION AU FEU"],
  "pravoúhlý tvar": ["rectangular shape", "rechteckige Form", "forme rectangulaire"],
  "PROFIL PŘÍČNÍKŮ **": ["HORIZONTAL BEAM SIZE **", "HORIZONTALRIEGEL GRÖSSE", "DIMENSION DES TRAVERSES **"],
  "PROFIL SLOUPKŮ **": ["VERTICAL BEAM SIZE **", "ECKSTIELE GRÖSSE", "DIMENSION DES MONTANTS **"],
  "PROHLUBEŇ PRO ZALOŽENÍ OCK VE SPRÁVNÉ POZICI A ROZMĚRU": ["PIT READINESS", "VORBEREITUNG DER SCHACHTGRUBE", "PRÉPARATION DE LA FOSSE"],
  "PROJEKČNÍ A PŘÍPRAVNÉ PRÁCE": ["PREPARATORY AND DESIGN WORK", "VORBEREITENDE UND PLANERISCHE ARBEITEN", "TRAVAUX PRÉPARATOIRES ET D’ÉTUDES"],
  "PROSKLENÁ PŘÍČKA VEDLE ŠACHTY": ["GLASS WALL NEXT TO THE SHAFT","GLASWAND NEBEN DEM SCHACHT","CLOISON VITRÉE À CÔTÉ DE LA GAINE"],
  "PROSKLENÁ STŘÍŠKA": ["GLASS CANOPY","GLASVORDACH","AUVENT VITRÉ"],
  "průchozí kabina": ["Through type car", "Durchgangskabine", "Cabine traversante"],
  "PŘECHODOVÉ PLECHY V NÁSTUPIŠTÍCH": ["LANDING SILL EXTENSION PLATES", "SCHWELLENVERLÄNGERUNGSPLATTEN", "TÔLES DE PROLONGEMENT DE SEUIL AUX PALIERS"],
  "přisazena k podestám (dle odchylky podest od svislice)": ["Attached to the landings platforms (follow vertical deviation)", "an die Podeste angesetzt (gemäß Abweichung der Podeste von der Senkrechten)", "accolée aux paliers (selon l’écart des paliers à la verticale)"],
  "příčníky z ocelových uzavřených profilů": ["Steel beam from closed profile", "Riegel aus geschlossenen Stahlprofilen", "traverses en profilés creux en acier"],
  "PŮDORYSNÉ ŘEŠENÍ ŠACHTY": ["FLOOR PLAN", "GRUNDRISS", "Plan d’étage"],
  "ROZSAH OPLÁŠTĚNÍ": ["CLADDING RANGE", "VERKLEIDUNGSBEREICH", "ÉTENDUE DE L’HABILLAGE"],
  "SOUČÁSTÍ DODÁVKY NENÍ": ["OUT OF SCOPE", "NICHT IM LIEFERUMFANG ENTHALTEN", "NON COMPRIS DANS LA LIVRAISON"],
  "STAVEBNÍ A PŘÍPRAVNÉ PRÁCE": ["CONSTRUCTION AND PREPARATORY WORK", "BAU- UND VORBEREITUNGSARBEITEN", "TRAVAUX DE CONSTRUCTION ET PRÉPARATOIRES"],
  "STAVEBNÍ PŘÍPRAVA": ["SITE READINESS","BAUSTELLENBEREITSCHAFT","PRÉPARATION DU CHANTIER"],
  "STŘECHA ŠACHTY": ["SHAFT ROOF", "SCHACHTDACH", "TOIT DE LA GAINE"],
  "svislá rozteč příčníků": ["vertical distance", "vertikaler Abstand", "entraxe vertical des traverses"],
  "SVISLÉ NOSNÉ PRVKY": ["VERTICAL STRUCTURE ELEMENTS", "ECKSTIELE", "ÉLÉMENTS PORTEURS VERTICAUX"],
  "TYP OPLÁŠTĚNÍ": ["CLADDING TYPE", "VERKLEIDUNGSTYP", "TYPE D’HABILLAGE"],
  "ULOŽENÍ KONSTRUKCE": ["SHAFT STRUCTURE BASE", "BASIS DER SCHACHTSTAHLKONSTRUKTION", "BASE DE LA STRUCTURE DE LA GAINE"],
  "UMÍSTĚNÍ VÝTAHOVÉHO STROJE": ["LIFT MACHINE LOCATION", "STANDORT DER AUFZUGSMASCHINE", "EMPLACEMENT DE LA MACHINE D’ASCENSEUR"],
  "UMÍSTĚNÍ ŠACHTY": ["SHAFT LOCATION", "STANDORT DES SCHACHTGERÜSTS", "EMPLACEMENT DE LA GAINE"],
  "USAZENÍ OCK - BOČNÍ STĚNY": ["SHAFT STRUCTURE FIXING - SIDE WALLS", "BEFESTIGUNG DES SCHACHTGERÜSTS - SEITENWÄNDE", "Fixation de la structure de gaine - parois latérales"],
  "USAZENÍ OCK - ČELNÍ STĚNA": ["SHAFT STRUCTURE FIXING - FRONT WALL", "BEFESTIGUNG DES SCHACHTGERÜSTS - VORDERWAND", "Fixation de la structure de gaine - paroi avant"],
  "VODOROVNÉ NOSNÉ PRVKY": ["HORIZONTAL STRUCTURE ELEMENTS", "HORIZONTALRIEGEL", "ÉLÉMENTS PORTEURS HORIZONTAUX"],
  "VZHLED KOTVENÍ ZASKLENÍ": ["CLADDING FIXING ELEMENT", "VERKLEIDUNGSBEFESTIGUNGSELEMENT", "ÉLÉMENT DE FIXATION DE L’HABILLAGE"],
  "VÝSTUP ZE ZAMĚŘENÍ PRO OBJEDNATELE": ["SITE SURVEY OUTPUT FOR CUSTOMER","AUSGABE DES LAGEPLANS FÜR DEN KUNDEN","LIVRABLE DU RELEVÉ POUR LE CLIENT"],
  "ZAMĚŘENÍ PROSTORŮ 3D SKENEREM": ["3D SCANNER SITE SURVEY", "VERMESSUNG DES GELÄNDES MIT EINEM 3D-SCANNER", "RELEVÉ DU SITE PAR SCANNER 3D"],
  "ZDVIH VÝTAHU [m] *": ["TRAVEL [m] *", "FÖRDERHÖHE [m] *", "Course de l’ascenseur [m] *"],
  "ZPRACOVÁNÍ DÍLENSKÉ DOKUMENTACE": ["SHOP / ASSEMBLY DRAWING COMPLETION", "FERTIGSTELLUNG VON WERKSTATT-/MONTAGEZEICHNUNGEN", "ÉLABORATION DES PLANS D’ATELIER / DE MONTAGE"],
  "ZPŮSOB KOTVENÍ OPLÁŠTĚNÍ": ["CLADDING FIXING", "VERKLEIDUNGSBEFESTIGUNG", "FIXATION DE L’HABILLAGE"],
  "ZÁBRADLÍ NA PODESTÁCH": ["HANDRAIL ON EACH FLOOR", "HANDLAUF AUF JEDER ETAGE", "GARDE-CORPS À CHAQUE ÉTAGE"],
  "ZÁBRADLÍ NA SCHODIŠTI": ["STAIRCASE HANDRAIL", "HANDLAUF IM TREPPENHAUS", "MAIN COURANTE DE L’ESCALIER"],
  "ZÁBRANY DO DVEŘNÍCH VSTUPŮ": ["BARRIER TO DOOR OPENING", "BARRIERE ZUR TÜRÖFFNUNG", "BARRIÈRES DES OUVERTURES DE PORTES"],
  "ZÁKLADNÍ PARAMETRY ŠACHTY": ["SHAFT CORE PARAMETERS", "PARAMETER DES SCHACHTGERÜSTS", "PARAMÈTRES DE BASE DE LA GAINE"],
  "ÚLOŽNÉ PROSTORY": ["STORAGE LOCATION", "LAGERPLATZ", "AIRE DE STOCKAGE"],
  "ÚPRAVA A OPRAVA SCHODNIC": ["STAIRCASE STEPS MODIF. / REPAIR", "UMBAU / REPARATUR VON TREPPENSTUFEN", "MODIFICATION / RÉPARATION DES MARCHES D’ESCALIER"],
  "ÚPRAVA PŮVODNÍCH OKOPŮ": ["KICKPLATES MODIFICATION", "ÄNDERUNG DER TRITTBLECHE", "MODIFICATION DES PLINTHES D’ORIGINE"],
  "čiré sklo": ["Clear glass", "Klarglas", "verre clair"],
  "ŘEŠENÍ PORTÁLŮ (PROSTOROVÉ)": ["LANDING ENTRANCE SOLUTION (SPACE)", "LÖSUNG DES TÜREINGANGS (RAUM)", "SOLUTION D’ENTRÉE D’ÉTAGE (ESPACE)"],
  "ŘEŠENÍ PORTÁLŮ (ČLENĚNÍ)": ["LANDING ENTRANCE SOLUTION (SEGMENT)", "LÖSUNG DES TÜREINGANGS (SEGMENT)", "SOLUTION D’ENTRÉE D’ÉTAGE (SEGMENT)"],

  /* ---- ostatní hesla ze slovníku (rezerva pro nabídky a smlouvy) ---- */
  "(tato technická specifikace bude použita jako příloha Smlouvy o Dílo nebo závazné objednávky)": ["(this document will be used as an annex to a contract or a binding order)", "(Dieses Dokument wird als Anhang zu einem Vertrag oder einer verbindlichen Bestellung verwendet)", "(Ce document sera utilisé comme annexe à un contrat ou une commande ferme)"],
  "* Uvažované rozměry nabízené šachty vychází z projektové dokumentace objednatele. Po přesném zaměření výšek a svislice zhotovitelem se mohou změnit!": ["* Shaft structure parameters for tender are based on project documentation provided by customer. It can be modified according to proper 3D scan survey provided by shaft supplier!", "* Die Parameter der Schachtstruktur für die Ausschreibung basieren auf der vom Kunden bereitgestellten Projektdokumentation. Sie können entsprechend der vom Schachtlieferanten zur Verfügung gestellten 3D-Vermessung geändert werden!", "* Les dimensions proposées de la gaine sont basées sur la documentation du projet fournie par le client. Elles peuvent être modifiées après une mesure précise des hauteurs et de la verticalité par le fournisseur de la gaine."],
  "* Uvažované rozměry nabízené šachty vychází ze zadání objednatele. Po přesném zaměření skutečného stavu zhotovitelem se mohou změnit!": ["* The shaft dimensions offered are based on the client's brief. They may change after a precise survey of the actual conditions carried out by the contractor!", "* Die angebotenen Schachtabmessungen beruhen auf den Vorgaben des Auftraggebers. Nach der genauen Vermessung des Ist-Zustands durch den Auftragnehmer können sie sich ändern!", "* Les dimensions proposées de la gaine sont basées sur le cahier des charges du client. Elles peuvent être modifiées après le relevé précis de l'état réel effectué par l'entrepreneur !"],
  "standardní dvojsklo čiré Ug=2,6": ["Standard clear double glazing Ug=2.6", "Standard-Isolierglas, klar, Ug=2,6", "Double vitrage standard clair Ug=2,6"],
  "přirozené, větrací mřížka v horní i dolní části zadní stěny výtahové šachty": ["Natural, ventilation grille in the upper and lower part of the rear wall of the lift shaft", "Natürlich, Lüftungsgitter im oberen und unteren Bereich der Rückwand des Aufzugsschachts", "Naturelle, grille de ventilation en partie haute et basse de la paroi arrière de la gaine d'ascenseur"],
  "1.  předávací protokol bude požadován po dokončení montáže ocelové konstrukce": ["1. Handover protocol will be used when shaft steel structure is completed.", "1. Das Übergabeprotokoll wird verwendet, wenn die Schachtstahlkonstruktion fertiggestellt ist.", "1. Le protocole de remise sera établi après l’achèvement du montage de la structure métallique."],
  "1. dílčí daňový doklad - 40 % (bez DPH) z celkové ceny díla bude vystaven po podpisu SoD. Úhrada tohoto daňového dokladu je podmínkou pro dodržení předem dohodnutých realizačních termínů.": ["1st partial invoice – 40 % (without VAT) of total price is released when contract is signed. In time payment is mandatory condition for compliance with the pre-agreed delivery milestones.", "1. Teilrechnung – 40 % (ohne MwSt.) des Gesamtpreises wird bei Vertragsunterzeichnung freigegeben. Die rechtzeitige Zahlung ist zwingende Voraussetzung für die Einhaltung der im Voraus vereinbarten Liefertermine.", "1re facture partielle – 40 % (hors TVA) du prix total, émise à la signature du contrat. Le paiement dans les délais est une condition impérative du respect des échéances convenues."],
  "2.  předávací protokol bude požadován po provedení opláštění výtahové šachty": ["2. Handover protocol will be used when shaft cladding is completed.", "2. Das Übergabeprotokoll wird verwendet, wenn die Schachtverkleidung abgeschlossen ist.", "2. Le protocole de remise sera établi après la réalisation de l’habillage de la gaine."],
  "2. dílčí daňový doklad - 50 % (bez DPH) z celkové ceny díla bude vystaven po dodání materiálu na stavbu a zahájení instalačních prací. Úhrada tohoto daňového dokladu je podmínkou pro předání díla objednateli.": ["2nd partial invoice – 50% (without VAT) of total price is released when material delivered on site and installation work start. In time payment is mandatory condition for handover of complete shaft.", "2. Teilrechnung – 50% (ohne MwSt.) des Gesamtpreises werden freigegeben, wenn das Material auf der Baustelle angeliefert wird und die Montagearbeiten beginnen. Die rechtzeitige Zahlung ist zwingende Voraussetzung für die Übergabe des kompletten Schachtes.", "2e facture partielle – 50 % (hors TVA) du prix total, émise à la livraison du matériel sur le chantier et au début du montage. Le paiement dans les délais est une condition impérative de la remise de l’ouvrage."],
  "2026-OPR-CN-01xx": ["2026-OPR-CN-01xx","2026-OPR-CN-01xx","2026-OPR-CN-01xx"],
  "3 ks montážních ok pro výškové práce": ["3 pcs of lifting eyes","3 Stk. Hebehaken","3 anneaux de levage pour travaux en hauteur"],
  "3.  předávací protokol bude požadován po provedení dokončovacích prací při předání a převzetí díla.": ["3. Handover protocol will be used when finishing works are done for final handover of completed shaft.", "3. Das Übergabeprotokoll wird verwendet, wenn die Abschlussarbeiten für die endgültige Übergabe des fertigen Schachtes durchgeführt werden.", "3. Le protocole de remise sera établi après les travaux de finition, lors de la remise et réception de l’ouvrage."],
  "3. konečný daňový doklad – 10% (bez DPH)  z celkové ceny díla bude vystaven po ukončení všech výše uvedených prací a po řádném předání a převzetí celého díla předávacím protokolem.": ["3rd final invoice – 10% (without VAT) of total price is released when all work is completed, shaft is fully handed over and handover protocol is signed.", "3. Schlussrechnung – 10% (ohne MwSt.) des Gesamtpreises werden freigegeben, wenn alle Arbeiten abgeschlossen sind, der Schacht vollständig übergeben und das Übergabeprotokoll unterzeichnet ist.", "3e facture finale – 10 % (hors TVA) du prix total, émise après l’achèvement de tous les travaux et la remise de l’ouvrage avec protocole signé."],
  "5 let záruka na celé dílo.": ["5 years warranty for the whole shaft structure and cladding.", "5 Jahre Garantie für die gesamte Schachtstruktur und Verkleidung.", "Garantie de 5 ans sur l’ensemble de l’ouvrage."],
  "a. cena vychází z technické specifikace nabídky – viz výše": ["a. final price is based on technical specification specified in this tender", "a. Der Endpreis basiert auf den technischen Spezifikationen, die in diesem Angebot angegeben sind", "a. le prix final est basé sur la spécification technique indiquée dans cette offre"],
  "Adresa stavby:": ["Site address:", "Baustellenadresse:", "Adresse du chantier :"],
  "aktualizace": ["updated", "Aktualisierung", "mise à jour"],
  "Autorská práva – EngineersCZ si vyhrazuje vlastnické a autorské právo k ilustracím, výkresům, skicám a jiným dokumentům a vzorkům. Tyto musí být na požádání neprodleně vráceny a nesmí být předány třetím stranám bez souhlasu EngineersCZ.": ["Copyright - EngineersCZ reserves the ownership and copyright of illustrations, drawings, sketches and other documents and samples. These must be returned immediately on request and may not be passed on to third parties without EngineersCZ's consent.", "Urheberrechte: - An Abbildungen, Zeichnungen, Skizzen, sonstigen Unterlagen und Mustern behält sich EngineersCZ die Eigentums- und Urheberrechte vor; sie sind auf Verlangen unverzüglich zurückzusenden und dürfen nicht an Dritte ohne Einverständnis von EngineersCZ weitergegeben werden.", "Droits d’auteur – EngineersCZ se réserve la propriété et les droits d’auteur des illustrations, dessins, croquis et autres documents et échantillons. Ceux-ci doivent être restitués immédiatement sur demande et ne peuvent être transmis à des tiers sans l’accord d’EngineersCZ."],
  "b. k úpravě celkové ceny může dojít po přesném zaměření a vyhodnocení statiky": ["b. based on full site survey and statics report the final price may be modified", "b. Auf der Grundlage der vollständigen Vermessung vor Ort und des Statikberichts kann der Endpreis angepasst werden", "b. le prix final peut être ajusté après le relevé complet du site et le rapport de calcul statique"],
  "bez DPH": ["Without VAT", "Ohne MwSt.", "hors TVA"],
  "Bez časového omezení v běžné pracovní době, možnost práce o víkendech": ["No time restrictions during normal working hours, possibility of working at weekends.", "Keine zeitlichen Einschränkungen während der normalen Arbeitszeiten, Möglichkeit der Arbeit an Wochenenden.", "Sans restriction horaire pendant les heures ouvrées normales, possibilité de travailler le week-end."],
  "cca": ["approx.", "ca.", "env."],
  "CHLAZENÍ POMOCÍ VENTILÁTORU": ["VENTILATION FAN IN THE SHAFT", "VENTILATOR IM SCHACHT", "VENTILATEUR DANS LA GAINE"],
  "CO NENÍ SOUČÁSTÍ DODÁVKY": ["OUT OF SCOPE","NICHT IM LIEFERUMFANG ENTHALTEN","HORS FOURNITURE"],
  "Datum:": ["Date:", "Datum:", "Date :"],
  "DEMONTÁŽ PŮVODNÍHO OHRAZENÍ ŠACHTY": ["DISMANTLING OF ORIGINAL STEEL SHAFT", "DEMONTAGE DER ORIGINALEN SCHACHTSTAHLKONSTRUKTION", "DÉMONTAGE DE L’ANCIENNE GAINE MÉTALLIQUE"],
  "DEMONTÁŽ STÁVAJÍCÍ ŠACHTY": ["DISMANTLING OF THE EXISTING SHAFT", "DEMONTAGE DES BESTEHENDEN SCHACHTES", "DÉMONTAGE DE LA GAINE EXISTANTE"],
  "DEMONTÁŽ STÁVAJÍCÍHO VÝTAHU": ["DISMANTLING OF THE EXISTING LIFT", "DEMONTAGE DES BESTEHENDEN AUFZUGS", "DÉMONTAGE DE L’ASCENSEUR EXISTANT"],
  "Demontáž, odvoz a likvidace původního ohrazení kolem výtahu v prostoru schodiště (z lešení po stavebních úpravách prohlubně)": ["Dismantling, removal and disposal of the original steel shaft.", "Demontage, Ausbau und Entsorgung des originalen Stahlschachtes.", "Démontage, évacuation et élimination de l’ancienne gaine métallique."],
  "Demontáž, odvoz a likvidace původního výtahu": ["Dismantling, removal and disposal of the original elevator.", "Demontage, Entfernung und Entsorgung des Originalaufzugs.", "Démontage, évacuation et élimination de l’ancien ascenseur."],
  "Dohoda ohledně termínů realizace a součinnosti s dodavatelem technologie výtahu": ["Installation time schedule for key project milestones will be aligned with elevator supplier.", "Der Zeitplan für die Installation wichtiger Projektmeilensteine wird mit dem Aufzugslieferanten abgestimmt.", "Le calendrier de montage des principales étapes du projet sera coordonné avec le fournisseur de l’ascenseur."],
  "Dojde-li v průběhu realizace díla k VÝRAZNÉMU zvýšení cen vstupních materiálů, oceli, skla a dopravného a paliv, může zhotovitel cenu díla zvýšit o tento rozdíl. Pro posouzení cenových změn se přihlíží k cenám platným v době uzavření smlouvy o dílo (nebo objednávky) ve srovnání s cenami platnými v době, kdy byl zhotovitel povinen dílo provést.": ["If the price of input materials, steel, glass, freight and fuel increase SIGNIFICANTLY during the project realization, the contractor may increase the price by the difference. For the purpose of assessing price changes, the prices at the time of conclusion of the contract (or order) shall be taken into account compared to the prices at the time of project completion.", "Wenn die Preise für Vormaterialien, Stahl, Glas, Fracht und Kraftstoff während der Projektrealisierung ERHEBLICH steigen, kann der Auftragnehmer den Preis um die Differenz erhöhen. Für die Beurteilung von Preisänderungen werden die Preise zum Zeitpunkt des Vertragsabschlusses (bzw. der Bestellung) mit den Preisen zum Zeitpunkt des Projektabschlusses verglichen.", "Si les prix des matériaux, de l’acier, du verre, du transport et des carburants augmentent de manière SIGNIFICATIVE pendant la réalisation du projet, l’entrepreneur peut augmenter le prix de cette différence. Pour l’évaluation des variations de prix, les prix en vigueur à la date de conclusion du contrat (ou de la commande) sont comparés aux prix en vigueur à la date d’achèvement du projet."],
  "DOKONČENÍ NÁSTUPIŠŤ VČETNĚ NAPOJENÍ K ŠACHETNÍM DVEŘÍM": ["LANDING ENTRANCE FLOOR COMPLETION", "FERTIGSTELLUNG DES BODENS IM EINGANGSBEREICH", "FINITION DES SOLS DES PALIERS Y COMPRIS RACCORD AUX PORTES PALIÈRES"],
  "Dokončovací práce do cca 2 týdny po ukončení montáže technologie výtahu – šachetních dveří.": ["Finishing work (mainly landing door entrance portals) will be done within 2 weeks after elevator installation is completed.", "Die abschließenden Arbeiten (vor allem die Portale der Schachttüren) werden innerhalb von 2 Wochen nach Abschluss der Aufzugsmontage durchgeführt.", "Les travaux de finition (principalement les portails des portes palières) seront réalisés dans les 2 semaines suivant l’achèvement du montage de l’ascenseur."],
  "Doprava, stavba a pronájem lešení (vnitřního i vnějšího) po dobu realizace šachty": ["Rental, transport and construction of scaffolding (inside and outside around shaft construction) for duration of the shaft installation.", "Vermietung, Transport und Aufbau eines Gerüstes (innen und außen um das Schachtbauwerk) für die Dauer der Schachtmontage.", "Location, transport et montage de l’échafaudage (intérieur et extérieur autour de la gaine) pendant la durée du montage."],
  "DPH": ["VAT","MwSt","TVA"],
  "DŘEVĚNÁ MADLA NA BOČNÍCH STĚNÁCH OCK": ["WOODEN HANDLE ON THE SIDE OF SHAFT STRUCTURE", "HOLZGRIFF AN DER SEITE DER SCHACHTSTAHLKONSTRUKTION", "MAINS COURANTES EN BOIS SUR LES PAROIS LATÉRALES DE LA GAINE"],
  "Firma, s.r.o.": ["Firma, s.r.o.","Firma, s.r.o.","Firma, s.r.o."],
  "Harmonogram montáže bude vypracován cca 3 týdny po podpisu smlouvy.": ["The shaft installation schedule will be compiled within approx. 3 weeks after the contract is signed.", "Der Zeitplan für die Schachtinstallation wird innerhalb von ca. 3 Wochen nach Vertragsunterzeichnung erstellt.", "Le calendrier de montage sera établi env. 3 semaines après la signature du contrat."],
  "hloubka kabiny": ["car depth", "Kabinentiefe", "profondeur de cabine"],
  "Hloubka vnitřní": ["Internal depth", "Innere Tiefe", "Profondeur intérieure"],
  "Hloubka vnější": ["External depth", "Äußere Tiefe", "Profondeur extérieure"],
  "Klempířské provedení střechy výtahové šachty z Cu plechu": ["Shaft roof made of copper sheet.", "Schachtdachlösung aus Kupferblech.", "Toit de la gaine réalisé en tôle de cuivre."],
  "kontaktní, hmoždinky do ŽB konstrukcí": ["Dowels for reinforced concrete structure", "Kontakt, Dübel in Stahlbetonkonstruktionen", "contact, chevilles dans les structures en béton armé"],
  "LEŠENÍ PRO REALIZACI ŠACHTY": ["SCAFFOLDING FOR SHAFT INSTALLATION","GERÜST FÜR DEN SCHACHTEINBAU","ÉCHAFAUDAGE POUR LA RÉALISATION DE LA GAINE"],
  "MADLO NA ŠACHTĚ": ["HANDRAIL ON THE SHAFT","HANDLAUF AUF DEM SCHACHT","MAIN COURANTE SUR LA GAINE"],
  "matná bílá folie": ["matt white foil", "mattweiße Folie", "film blanc mat"],
  "mléčné (matné) sklo": ["frosted glass", "Mattglas", "verre dépoli (mat)"],
  "MONTOVANÉ ocelové konstrukce": ["MOUNTED steel structure", "montierte Stahlkonstruktion", "structure métallique MONTÉE"],
  "Montáž ocelové konstrukce výtahové šachty cca 1-2 týdny.": ["Installation of the steel shaft structure takes approx. 1–2 weeks.", "Die Montage der Stahlschachtkonstruktion dauert 1-2 Wochen.", "Le montage de la structure métallique de la gaine dure env. 1 à 2 semaines."],
  "MĚDĚNÁ STŘEŠNÍ KRYTINA": ["COPPER ROOFING", "KUPFER-DACHEINDECKUNG", "COUVERTURE DE TOIT EN CUIVRE"],
  "měřítko": ["scale", "Maßstab", "échelle"],
  "nabídková cena": ["tender price", "Angebotssumme", "prix de l’offre"],
  "Nad venkovním vstupem do výtahu bude umístěna prosklená stříška v šířce celé OCK.": ["Glass canopy over exterior elevator entrance. Canopy width is equal to shaft construction width.", "Über dem Außeneingang zum Aufzug wird ein Glasvordach in der Breite der Schachtstahlkonstruktion angebracht.", "Un auvent vitré sera installé au-dessus de l’entrée extérieure, sur toute la largeur de la structure de la gaine."],
  "nadzemní patro": ["upper floor", "Obergeschoss (OG)", "étage supérieur"],
  "NAPÁJENÍ VÝTAHU VČET. REVIZNÍ ZPRÁVY": ["INSPECTED EL. POWER SUPPLY FOR LIFT", "GEPRÜFTE STROMVERSORGUNG FÜR DEN AUFZUG (inkl. Revisionsbericht)", "ALIMENTATION ÉLECTRIQUE DE L’ASCENSEUR CONTRÔLÉE (rapport de révision incl.)"],
  "NEREZOVÁ MADLA NA BOČNÍCH STĚNÁCH OCK": ["STAINLESS STEEL HANDLE ON THE SIDE OF SHAFT STRUCTURE", "EDELSTAHLGRIFF AN DER SEITE DER SCHACHTSTAHLKONSTRUKTION", "MAINS COURANTES EN INOX SUR LES PAROIS LATÉRALES DE LA GAINE"],
  "nerezový plech dle zaměření ve všech nástupištích": ["Stainless steel metal sheet in each floor (based on site survey)","Edelstahlbleche in jedem Stockwerk (auf der Grundlage der Vermessung vor Ort)","Tôle inox selon relevé, à tous les arrêts"],
  "Nerezový plech ve tvaru dle individuálního zaměření spojující podestu nástupiště s prahem šachetních dveří v šířce vstupu": ["Stainless steel plate connecting the platform with landing door sill. Designed according to site survey.", "Edelstahlplatte, die die Plattform mit der Schwelle der Schachttür verbindet. Entworfen nach ordnungsgemäßer Standortvermessung.", "Tôle en inox reliant le palier au seuil des portes palières, réalisée selon le relevé sur site."],
  "Nosnost": ["load", "Tragkraft", "charge utile"],
  "NOVÁ PROHLUBEŇ": ["NEW PIT", "NEUE GRUBE", "NOUVELLE FOSSE"],
  "NOVÉ ZÁBRADLÍ/MADLA NA ŠACHTĚ": ["NEW HANDRAIL ON THE SHAFT", "NEUER HANDLAUF AM SCHACHT", "NOUVELLE MAIN COURANTE SUR LA GAINE"],
  "Nutná koordinace s celkovým harmonogramem stavby.": ["Coordination with overall site installation schedule is mandatory.", "Die Koordinierung mit dem gesamten Zeitplan für die Installation vor Ort ist obligatorisch.", "La coordination avec le calendrier général du chantier est obligatoire."],
  "nutná stavební příprava kabelových elektrorozvodů včetně jističů pro připojení přímotopu – zajistí stavba v rámci přípravy elektroinstalace pro připojení výtahu, výkon přímotopu max. 2 kW": ["Delivery consists of heater, sensor and thermostat. Site to prepare the necessary wiring and circuit breaker installation in cooperation with the elevator supplier. Heater power max. 2 kW.", "Die Lieferung besteht aus Heizung, Sensor und Thermostat. Bauseitige Vorbereitung der erforderlichen Verkabelung und Installation der Leistungsschalter in Zusammenarbeit mit dem Aufzugslieferanten. Heizleistung max. 2 kW.", "La livraison comprend le chauffage, le capteur et le thermostat. Le chantier prépare le câblage nécessaire et l’installation des disjoncteurs en coopération avec le fournisseur de l’ascenseur. Puissance max. 2 kW."],
  "Nutná stavební příprava kabelových elektrorozvodů včetně jističů pro připojení ventilátoru – zajistí stavba v rámci přípravy elektroinstalace pro připojení výtahu, nutná spolupráce při návrhu": ["Delivery consists of fan, sensor and thermostat. Site to prepare the necessary wiring and circuit breaker installation in cooperation with the elevator supplier.", "Die Lieferung besteht aus Ventilator, Sensor und Thermostat. Bauseitige Vorbereitung der erforderlichen Verkabelung und Installation der Leistungsschalter in Zusammenarbeit mit dem Aufzugslieferanten.", "La livraison comprend le ventilateur, le capteur et le thermostat. Le chantier prépare le câblage nécessaire et l’installation des disjoncteurs en coopération avec le fournisseur de l’ascenseur."],
  "Následné opláštění konstrukce šachty cca 1-2 týdny.": ["Shaft cladding installation takes approx. 1–2 weeks.", "Die Montage der Schachtverkleidung dauert 1-2 Wochen.", "L’habillage de la gaine dure env. 1 à 2 semaines."],
  "nástupiště": ["landing", "Zugangsstelle", "palier"],
  "NÁSTUPNÍ MŮSTKY": ["LANDING ACCESS BRIDGES", "ZUGANGSBRÜCKEN", "PASSERELLES D’ACCÈS AUX PALIERS"],
  "NÁTĚR BOKŮ SCHODIŠTĚ": ["STAIRS SIDE PAINTING", "ANSTRICH DER TREPPENSEITE", "PEINTURE DES CÔTÉS DE L’ESCALIER"],
  "Název akce:": ["Project name:", "Projektname:", "Nom du projet :"],
  "NĚJAKÝ DALŠÍ DOPLŇKOVÝ PRVEK": ["ADDITIONAL SHAFT CUSTOM ITEM(S)", "WEITERE KUNDENSPEZIFISCHE ZUSATZELEMENTE", "AUTRES ÉLÉMENTS SUPPLÉMENTAIRES SUR MESURE"],
  "Objednatel:": ["Customer:", "Kunde:", "Client :"],
  "OCELOVÁ PROHLUBEŇ": ["STEEL PIT", "STAHLGRUBE", "FOSSE EN ACIER"],
  "ocelový profil": ["steel profile", "Stahlprofil", "profilé en acier"],
  "Ochrana proti pádu nesmí bránit naší instalaci": ["Fall protection must not impede our installation.","Die Absturzsicherung darf unsere Montage nicht behindern.","La protection antichute ne doit pas gêner notre montage."],
  "ochrana před sluncem": ["sun protection", "Sonnenschutz", "protection solaire"],
  "Od výškové úrovně": ["Cladding starts at level","Verkleidung beginnt auf Ebene","À partir du niveau"],
  "OPLECHOVÁNÍ SOKLU PROHLUBNĚ": ["METAL SHEET COVER ON PIT EDGE", "BLECHABDECKUNG AM GRUBENRAND", "COUVERTINE EN TÔLE SUR LE BORD DE LA FOSSE"],
  "OPLÁŠTĚNÍ HLAVY ŠACHTY": ["SHAFT HEAD CLADDING", "SCHACHTKOPF-VERKLEIDUNG", "HABILLAGE DE LA TÊTE DE GAINE"],
  "Oprava nátěru na konstrukci šachty po dokončení instalace výtahu": ["Painting correction on steel structure of the shaft after elevator installation is completed.", "Ausbesserung der Lackierung an der Stahlkonstruktion des Schachts nach Abschluss der Aufzugsmontage.", "Retouche de peinture sur la structure métallique de la gaine après l’achèvement du montage de l’ascenseur."],
  "OPRAVA NÁTĚRU": ["PAINTING CORRECTION AND FIXING", "AUSBESSERUNG DER LACKIERUNG", "RETOUCHE DE PEINTURE"],
  "OPRAVA NÁŤERU": ["PAINTING CORRECTION AND FIXING", "AUSBESSERUNG DER LACKIERUNG", "RETOUCHE DE PEINTURE"],
  "OPRAVA OMÍTKY PODEST": ["LANDING PLASTER FIXING","AUSBESSERUNG DES PUTZES AN DEN PODESTEN","REPRISE DE L'ENDUIT DES PALIERS"],
  "Parkovací místo v bezprostřední blízkosti stavby pro potřeby montáže a vykládání materiálu.": ["Parking space next to the building for the purpose of installation and unloading of material.","Parkplatz neben dem Gebäude für die Montage und das Abladen des Materials.","Place de stationnement à proximité immédiate du chantier pour le montage et le déchargement du matériel."],
  "patro": ["floor (stop)", "Etage", "étage"],
  "PLATEBNÍ PODMÍNKY": ["BILLING PLAN","ZAHLUNGSBEDINGUNGEN","CONDITIONS DE PAIEMENT"],
  "Platnost této nabídky je 3 měsíce od data uvedeného v záhlaví": ["Tender validity is 3 months from date of issue.", "Dieses Angebot ist 3 Monate ab Ausstellungsdatum gültig.", "La validité de cette offre est de 3 mois à compter de la date indiquée en en-tête."],
  "Podkroví, půda": ["Attic, Penthouse", "Dachgeschoss (DG)", "combles, attique"],
  "pohled (na vykrese)": ["view", "Ansicht", "vue (sur le plan)"],
  "Pokud montáž nezačne dle plánu z důvodu opoždění stavby – musí se konstrukce uskladnit. Částka bude účtována pokud stavba nezajistí bezplatné a bezpečné uskladnění.": ["If the installation does not start as planned due to construction delays - the shaft structure must be stored. The amount will be charged if the customer does not provide free and safe storage.", "Wenn die Installation aufgrund von Bauverzögerungen nicht wie geplant beginnen kann, muss das Schachtbauwerk gelagert werden. Der Betrag wird in Rechnung gestellt, wenn der Kunde nicht für eine kostenlose und sichere Lagerung sorgt.", "Si le montage ne commence pas comme prévu en raison de retards du chantier, la structure doit être stockée. Le montant sera facturé si le client n’assure pas un stockage gratuit et sûr."],
  "POVRCHOVÁ ÚPRAVA": ["STEEL STRUCTURE FINISHING", "SCHACHTGERÜST-LACKIERUNG", "FINITION DE LA STRUCTURE MÉTALLIQUE"],
  "pozinkování": ["Zincoated", "Verzinkt", "galvanisé"],
  "POŽADAVKY PRO PROVEDENÍ REALIZACE:": ["REQUIREMENTS FOR PROJECT REALIZATION:", "VORAUSSETZUNGEN FÜR DIE PROJEKTREALISIERUNG:", "EXIGENCES POUR LA RÉALISATION DU PROJET :"],
  "Pro dokončení projekční části je nutné poskytnout finální dispoziční výkresy výtahové technologie": ["Final and approved layout drawings of the elevator technology are needed to complete the shaft design.", "Endgültige und genehmigte Anordnungszeichnungen (Layouts) der Aufzugstechnik sind erforderlich, um die Schachtplanung abzuschließen.", "Les plans d’implantation définitifs et approuvés de la technologie d’ascenseur sont nécessaires pour finaliser l’étude de la gaine."],
  "Pro zasklení OCK výše uvedeným způsobem bude použito čirých skel vrstvených na mléčnou bezpečnostní fólii": ["Clear glass layered with frosted safety foil.", "Klarglas mit mattierter Sicherheitsfolie überzogen.", "Verre clair feuilleté avec film de sécurité dépoli."],
  "PROHLUBEŇ": ["pit", "Grube / Schachtgrube", "fosse"],
  "Prohlubeň a nástupní můstky ve všech nástupištích": ["Shaft pit and distance bridges in each floor", "Schachtgrube und Distanzbrücken in jeder Etage", "Fosse et passerelles d’accès à tous les paliers"],
  "PROSKLENÁ STŘÍŠKA NAD VENKOVNÍM VSTUPEM DO VÝTAHU": ["GLASS CANOPY OVER OUTDOOR ELEVATOR ENTRANCE", "GLASVORDACH ÜBER DEM AUSSENEINGANG ZUM AUFZUG", "AUVENT VITRÉ AU-DESSUS DE L’ENTRÉE EXTÉRIEURE DE L’ASCENSEUR"],
  "PROSKLENÍ ŠACHTY MLÉČNÝMI SKLY": ["SHAFT CLADDING WITH FROSTED GLASS", "SCHACHTVERKLEIDUNG MIT SATINIERTEM GLAS", "HABILLAGE DE LA GAINE EN VERRE DÉPOLI"],
  "Prostor pro skladování materiálu a nářadí během montáže": ["Storage location for materials and tools during installation.", "Lagerplatz für Material und Werkzeug während der Montage.", "Espace de stockage pour le matériel et l’outillage pendant le montage."],
  "Provedení vnějších skel opláštění výtahové šachty s vyšším koeficientem tepelné reflexe kvůli zmírnění přehřívání interiéru šachty vlivem slunečního svitu": ["Cladding glass with a higher coefficient of thermal resistance to mitigate shaft interior overheating due to sunlight.", "Verkleidungsglas mit einem höheren Wärmewiderstandskoeffizienten, um die Überhitzung des Schachtinneren durch Sonnenlicht zu verringern.", "Vitrage d’habillage avec un coefficient de réflexion thermique plus élevé pour limiter la surchauffe de l’intérieur de la gaine due au soleil."],
  "průběžná, vedle podest": ["Continuous, next to the platforms", "durchgehend, neben den Podesten", "continue, le long des paliers"],
  "PŘECHODOVÉ PLECHY VE VŠECH NÁSTUPIŠTÍCH": ["SILL EXTENSION PLATES IN ALL LANDINGS", "SCHWELLENVERLÄNGERUNGSPLATTEN IN ALLEN PODESTEN", "TÔLES DE PROLONGEMENT DE SEUIL À TOUS LES PALIERS"],
  "PŘEDÁNÍ DÍLA:": ["HANDOVER OF COMPLETE INSTALLATION:", "ÜBERGABE DER KOMPLETTEN INSTALLATION:", "REMISE DE L’OUVRAGE :"],
  "přejezd": ["OVERHEAD", "Schachtkopf", "réserve supérieure (hauteur libre)"],
  "Připojení na elektřinu 230V": ["Electric power line of 230V for installation needs.", "Stromanschluss mit 230 V für die Installation.", "Raccordement électrique 230 V pour les besoins du montage."],
  "PŘÍMOTOP S ČIDLEM A TERMOSTATEM": ["HEATING WITH SENSOR AND THERMOSTAT", "HEIZUNG MIT SENSOR UND THERMOSTAT", "CHAUFFAGE AVEC CAPTEUR ET THERMOSTAT"],
  "příplatky": ["extra charge", "Mehrpreis", "suppléments"],
  "PŘÍPRAVA PRO DALŠÍ DODAVATELE": ["PREPARATORY FOR OTHER SUBCONTRACTORS","VORBEREITUNGEN FÜR ANDERE SUBUNTERNEHMER","PRÉPARATION POUR LES AUTRES FOURNISSEURS"],
  "přístavba/vestavba nové prosklené OCK výtahové šachty": ["extension / built-in installation of a new glazed steel elevator shaft structure", "Anbau/Einbau eines neuen verglasten Aufzugsschachtgerüsts", "extension / intégration d'une nouvelle structure métallique vitrée de gaine d'ascenseur"],
  "přístavba/vestavba nové OCK výtahové šachty včetně opláštění": ["extension / built-in installation of a new steel elevator shaft structure incl. cladding", "Anbau/Einbau eines neuen Aufzugsschachtgerüsts einschließlich Verkleidung", "extension/intégration d’une nouvelle gaine d’ascenseur en acier, habillage compris"],
  "přízemí": ["ground floor","Erdgeschoss (EG)","rez-de-chaussée"],
  "příčka": ["HORIZONTAL BEAM", "Horizontalriegel", "traverse"],
  "příčník": ["crossbar", "Querriegel", "traverse"],
  "půdorys": ["floor plan", "Grundriss", "plan (vue en plan)"],
  "Reference:": ["References:","Referenzen:","Références :"],
  "Reflexní vrstva na vnější straně skel opláštění výtahové šachty kvůli zvýšení neprůhlednosti celé šachty": ["Reflective cladding glass for reducing transparency of the entire shaft.", "Reflektierendes Verkleidungsglas zur Reduzierung der Transparenz des gesamten Schachtes.", "Vitrage réfléchissant pour réduire la transparence de l’ensemble de la gaine."],
  "rohový sloupek": ["corner column", "Eckstiel", "montant d’angle"],
  "Rovná nerezová trubka se zaslepenými konci (celkem 2 kusy)": ["Stainless steel tube with end covers (2 pcs per floor)", "Edelstahlrohr mit Enddeckeln (2 Stück pro Etage)", "Tube en inox avec embouts (2 pièces par étage)"],
  "Rovný profil z tvrdého dřeva, čirý lak (celkem 2 kusy na každé mezipatro)": ["Hard wood handle with painted finishing (2pcs per floor)", "Hartholzgriff mit lackierter Oberfläche (2 Stück pro Etage)", "Profil en bois dur, vernis clair (2 pièces par demi-étage)"],
  "ROZMĚR ŠACHTY [mm] *": ["SHAFT SIZE [mm] *", "SCHACHTGRÖSSE [mm] *", "DIMENSIONS DE LA GAINE [mm] *"],
  "SKLA S VNĚJŠÍ POVRCHOVOU ÚPRAVOU (Stopsol, apod.)": ["CLADDING GLASS WITH ADDITIONAL FINISHING (Stopsol, etc.)", "SONNENSCHUTZVERGLASUNG (Stopsol usw.)", "VITRAGE AVEC TRAITEMENT DE SURFACE EXTÉRIEUR (Stopsol, etc.)"],
  "SKLA S VYŠŠÍ ENERGETICKOU REFLEXÍ": ["HIGH ENERGY RESISTANCE CLADDING GLASS", "HOCHENERGIEBESTÄNDIGES VERKLEIDUNGSGLAS", "VITRAGE À HAUTE RÉFLEXION THERMIQUE"],
  "Sloupko-příčková fasáda": ["Post-and-Rail Façade", "Pfosten-Riegel-Fassade", "façade à montants et traverses"],
  "Splatnost faktur 14 dní ode dne vystavení": ["Invoices are due 14 days from the date of issue.", "Alle Zahlungen verstehen sich 14 Tage netto ohne Abzug.", "Les factures sont payables à 14 jours à compter de leur date d’émission."],
  "Statika objektu a zkušební statika": ["Building statics and test statics.", "Gebäudestatik und Prüfstatik.", "Statique du bâtiment et statique d’essai."],
  "stavba": ["site","Baustelle","chantier"],
  "STAVEBNÍK": ["building owner", "BAUHERR", "MAÎTRE D’OUVRAGE"],
  "Strojovna": ["Machine room", "Triebwerksraum", "local des machines"],
  "Stručný popis doplňkového prvku nabízené šachty.": ["Description to be added here.", "Beschreibung muss hier hinzugefügt werden.", "Description à compléter ici."],
  "STŘECHA NAD NÁSTUPIŠTĚM": ["CANOPY OVER ENTRANCE", "VORDACH ÜBER DEM EINGANG", "AUVENT AU-DESSUS DE L’ENTRÉE"],
  "Suterén": ["basement", "Untergeschoss (UG)", "sous-sol"],
  "Technická specifikace výtahové šachty": ["Elevator steel shaft technical specification", "Technische Spezifikation des Aufzugsschachtgerüsts", "Spécification technique de la gaine d’ascenseur"],
  "TERMÍNY REALIZACE:": ["INSTALLATION SCHEDULE:", "INSTALLATIONSZEITPLAN:", "CALENDRIER DE RÉALISATION :"],
  "TYP KONSTRUKCE": ["SHAFT STRUCTURE TYPE", "SCHACHTSTAHLKONSTRUKTION TYP", "TYPE DE STRUCTURE DE GAINE"],
  "Ulice orientační/popisné, Město": ["Street name, bldg nr, town, Germany","Straßenname, Hausnummer, Ort, Deutschland","Rue et numéro, Ville"],
  "UMÍSTĚNÍ OPLÁŠTĚNÍ": ["CLADDING POSITION", "POSITION DER VERKLEIDUNG", "POSITION DE L’HABILLAGE"],
  "USAZENÍ ZADNÍ STĚNY OCK": ["SHAFT STRUCTURE FIXING - REAR WALL", "BEFESTIGUNG DES SCHACHTGERÜSTS - RÜCKWAND", "Fixation de la structure de gaine - paroi arrière"],
  "USKLADNĚNÍ MATERIÁLU Z DŮVODU OPOŽDĚNÍ MONTÁŽE": ["MATERIAL STORAGE DUE TO INSTALLATION DELAYS", "MATERIALLAGERUNG AUFGRUND VON MONTAGEVERZÖGERUNGEN", "STOCKAGE DU MATÉRIEL EN CAS DE RETARD DU MONTAGE"],
  "VENTILÁTOR S ČIDLEM A TERMOSTATEM": ["FAN WITH SENSOR AND THERMOSTAT", "VENTILATOR MIT SENSOR UND THERMOSTAT", "VENTILATEUR AVEC CAPTEUR ET THERMOSTAT"],
  "VNITŘNÍ LEŠENÍ PRO MONTÁŽ OCK": ["INSTALLATION SCAFFOLDING - INSIDE SHAFT", "EINBAUGERÜST - INNERHALB DES SCHACHTS", "ÉCHAFAUDAGE DE MONTAGE – À L’INTÉRIEUR DE LA GAINE"],
  "VNĚJŠÍ LEŠENÍ PRO ZASKLENÍ ŠACHTY": ["INSTALLATION SCAFFOLDING - AROUND SHAFT", "EINBAUGERÜST - RUND UM DEN SCHACHT", "ÉCHAFAUDAGE DE MONTAGE – AUTOUR DE LA GAINE"],
  "vrchní (konečný) nátěr": ["top coat", "Deckanstrich", "couche de finition"],
  "vstup": ["entrance", "Eingang", "entrée"],
  "VYBUDOVÁNÍ NOVÉ PROHLUBNĚ": ["NEW PIT","ERSTELLUNG EINER NEUEN SCHACHTGRUBE","RÉALISATION D'UNE NOUVELLE CUVETTE"],
  "vypracoval": ["compiled by","Zusammengestellt von","établi par"],
  "VYTÁPĚNÍ POMOCÍ PŘÍMOTOPU": ["SHAFT HEATING", "SCHACHTHEIZUNG", "CHAUFFAGE DE LA GAINE"],
  "výtahová šachta": ["shaft", "Schacht", "gaine"],
  "X / X": ["X / X","X / X","X / X"],
  "XX,XXX": ["XX,XXX","XX,XXX","XX,XXX"],
  "XX.XX.2026": ["XX.XX.2026","XX.XX.2026","XX.XX.2026"],
  "xxxx": ["xxxx","xxxx","xxxx"],
  "XXXXX": ["XXXXX","XXXXX","XXXXX"],
  "Zahájení montáže cca 12 týdnů po podpisu SoD a odsouhlasení finálních dispozičních výkresů celé technologie výtahu a šachty.": ["Installation will start approx. 12 weeks from contract signature AND final approved elevator and shaft layout drawings.", "Die Installation beginnt ca. 12 Wochen nach Vertragsunterzeichnung UND endgültiger Genehmigung der Aufzugs- und Schachtgrundrisszeichnungen.", "Le montage commencera env. 12 semaines après la signature du contrat ET l’approbation définitive des plans d’implantation de l’ascenseur et de la gaine."],
  "Zajištění montážního lešení": ["Provide installation scaffolding.", "Bereitstellung eines Montagegerüsts.", "Mise à disposition d’un échafaudage de montage."],
  "Zajištění přístupu na místo realizace a do všech prostor s realizací díla souvisejících včetně transportních cest (nutné dojednat před zahájením přípravných prací)": ["Ensuring access to the site and to all areas related to installation, including transport routes (to be arranged before the start of pre-work).", "Sicherstellung des Zugangs zur Baustelle und zu allen mit der Installation zusammenhängenden Bereichen, einschließlich der Transportwege (vor Beginn der Vorarbeiten zu vereinbaren).", "Assurer l’accès au site et à tous les espaces liés à la réalisation, y compris les voies de transport (à convenir avant le début des travaux préparatoires)."],
  "ZDVIH": ["TRAVEL","FÖRDERHÖHE","COURSE"],
  "Zjevné chyby v nabídkovém řízení mohou být opraveny před podpisem smlouvy.": ["Obvious errors in the tendering procedure may be corrected before the contract is signed.", "Offensichtliche Angebotsfehler können vor Auftragsannahme berichtigt werden.", "Les erreurs manifestes de l’offre peuvent être corrigées avant la signature du contrat."],
  "změna": ["revision / change", "Änderungen", "modification"],
  "zrcadlo schodiště": ["Stairwell Void", "Treppenauge", "jour d’escalier"],
  "ZÁBRADLÍ VEDLE ŠACHTY": ["HANDRAIL NEXT TO THE SHAFT","HANDLAUF NEBEN DEM SCHACHT","GARDE-CORPS À CÔTÉ DE LA GAINE"],
  "základní nátěr": ["primer","Grundierung","couche primaire"],
  "ZÁKLADOVÁ DESKA PRO ZALOŽENÍ NOSNÉ PODCHOZÍ KONSTRUKCE": ["FOUNDATION SLAB FOR SHAFT SUB-STRUCTURE", "FUNDAMENTPLATTE FÜR SCHACHTUNTERKONSTRUKTION", "DALLE DE FONDATION POUR LA SOUS-STRUCTURE DE LA GAINE"],
  "ÚPRAVA PROHLUBNĚ NA NOVÝ ROZMĚR": ["PIT MODIFICATION TO NEW DIMENSIONS", "ANPASSUNG DER SCHACHTGRUBE AUF NEUE ABMESSUNGEN", "MODIFICATION DE LA FOSSE AUX NOUVELLES DIMENSIONS"],
  "Číslo nabídky:": ["Tender number:", "Angebots-Nr.:", "Numéro de l’offre :"],
  "řez": ["section", "Schnitt", "coupe"],
  "šířka kabiny": ["car width", "Kabinenbreite", "largeur de cabine"],
  "Šířka vnitřní": ["Internal width", "Innere Breite", "Largeur intérieure"],
  "Šířka vnější": ["External width", "Äußere Breite", "Largeur extérieure"],

  /* ---- doplněno 2026-07-26: technická specifikace vč. rolovacích seznamů (úkol N1b) ---- */
  "1250-1500 mm": ["1250-1500 mm","1250-1500 mm","1250-1500 mm"],
  "4x rohový sloupek + 1x sloupek v zadní stěně, ocelové uzavřené profily": ["4 corner columns + 1 column in the rear wall, closed steel profiles","4 Eckstiele + 1 Stiel in der Rückwand, geschlossene Stahlprofile","4 poteaux d'angle + 1 poteau dans la paroi arrière, profilés acier fermés"],
  "4x rohový sloupek + 2x sloupek v bočních stěnách, ocelové uzavřené profily": ["4 corner columns + 2 columns in the side walls, closed steel profiles","4 Eckstiele + 2 Stiele in den Seitenwänden, geschlossene Stahlprofile","4 poteaux d'angle + 2 poteaux dans les parois latérales, profilés acier fermés"],
  "6x sloupek ve vrcholech 6-ti úhelníkového půdorysu": ["6 columns at the corners of the hexagonal plan","6 Stiele an den Ecken des sechseckigen Grundrisses","6 poteaux aux sommets du plan hexagonal"],
  "8x sloupek ve vrcholech 8-mi úhelníkového půdorysu": ["8 columns at the corners of the octagonal plan","8 Stiele an den Ecken des achteckigen Grundrisses","8 poteaux aux sommets du plan octogonal"],
  "ano, oválné otvory pro kotvení konzolí vodítek a šachetních dveří v příčnících OCK včetně dodávky T šroubů M12 s podložkou": ["Yes, oval holes in the cross beams of the steel structure for fixing the guide rail brackets and landing doors, including supply of M12 T-bolts with washers","Ja, Langlöcher in den Querträgern der Stahlkonstruktion zur Befestigung der Führungsschienenbügel und der Schachttüren, inkl. Lieferung von T-Schrauben M12 mit Unterlegscheibe","Oui, trous oblongs dans les traverses de la structure pour la fixation des consoles de guides et des portes palières, y compris la fourniture de boulons en T M12 avec rondelle"],
  "bez dokrytí": ["Without cover plate","Ohne Abdeckung","Sans recouvrement"],
  "bez opláštění, komplet dozdí stavba": ["Without cladding, fully bricked up by the building contractor","Ohne Verkleidung, komplett bauseits zugemauert","Sans bardage, entièrement rebouché en maçonnerie par l'entreprise"],
  "bez opláštění": ["Without cladding","Ohne Verkleidung","Sans bardage"],
  "bez předsazených portálů": ["Without projecting entrance portals","Ohne vorgesetzte Eingangsportale","Sans entrées d'étage en saillie"],
  "bez zastřešení (OCK končí pod stropem)": ["Without roofing (the steel structure ends below the ceiling)","Ohne Bedachung (die Stahlkonstruktion endet unter der Decke)","Sans toiture (la structure se termine sous le plafond)"],
  "bezúplatně zajistí objednatel": ["Provided by the customer free of charge","Wird vom Besteller kostenlos zur Verfügung gestellt","Fourni gratuitement par le client"],
  "cementotřískové desky včetně zateplení": ["Cement-bonded particle boards including thermal insulation","Zementspanplatten einschließlich Wärmedämmung","Panneaux de particules liées au ciment avec isolation thermique"],
  "cementotřískové desky": ["Cement-bonded particle boards","Zementspanplatten","Panneaux de particules liées au ciment"],
  "čiré sklo - hrany strojově broušeny": ["Clear glass - machine-ground edges","Klarglas - maschinell geschliffene Kanten","Verre clair - chants polis à la machine"],
  "do L profilů mezi příčníky": ["Into L profiles between the cross beams","In L-Profile zwischen den Querträgern","Dans des cornières entre les traverses"],
  "do rámečku z plechových lišt": ["Into a frame made of sheet metal trims","In einen Rahmen aus Blechleisten","Dans un cadre en baguettes de tôle"],
  "DOKONČENÍ PODLAH NÁSTUPIŠŤ A NAPOJENÍ K PRAHŮM Š. DVEŘÍ": ["LANDING FLOOR COMPLETION AND CONNECTION TO LANDING DOOR SILLS","FERTIGSTELLUNG DER PODESTBÖDEN UND ANSCHLUSS AN DIE SCHACHTTÜRSCHWELLEN","FINITION DES SOLS DES PALIERS ET RACCORDEMENT AUX SEUILS DES PORTES PALIÈRES"],
  "dokončení provede stavba": ["Completion by the building contractor","Fertigstellung bauseits","Finition réalisée par l'entreprise de construction"],
  "dokrytí nerezovým plechem": ["Covered with stainless steel sheet","Verkleidet mit Edelstahlblech","Recouvrement en tôle inox"],
  "DOSTATEČNÉ PŘÍSTUPOVÉ A MANIPULAČNÍ PROSTORY": ["SUFFICIENT ACCESS AND HANDLING SPACE","AUSREICHENDE ZUGANGS- UND MANIPULATIONSFLÄCHEN","ESPACES D'ACCÈS ET DE MANUTENTION SUFFISANTS"],
  "dveřní vstup ze dvora (diagonálně průchozí kabina)": ["Door entrance from the courtyard (corner entry through-type car)","Türzugang vom Hof (Kabine mit Eckzugang)","Accès par la cour (cabine traversante à angle)"],
  "dveřní vstup ze dvora (průchozí kabina)": ["Door entrance from the courtyard (through-type car)","Türzugang vom Hof (Durchladekabine)","Accès par la cour (cabine traversante)"],
  "hydraulický agregát v samostatné místnosti mimo šachtu": ["Hydraulic power unit in a separate room outside the shaft","Hydraulikaggregat in einem separaten Raum außerhalb des Schachts","Centrale hydraulique dans un local séparé hors de la gaine"],
  "individuální řešení": ["Individual solution","Individuelle Lösung","Solution individuelle"],
  "izolační dvojskla vsazená do lakovaných rámečků": ["Insulating double glazing set in painted frames","Isolierverglasung in lackierte Rahmen eingesetzt","Double vitrage isolant posé dans des cadres laqués"],
  "izolační dvojsklo v kombinaci s vrstveným bezpečnostním sklem VSG": ["Insulating double glazing combined with laminated safety glass VSG","Isolierverglasung in Kombination mit Verbundsicherheitsglas VSG","Double vitrage isolant combiné avec du verre feuilleté de sécurité VSG"],
  "je součástí dodávky na celou dobu stavby": ["Included in the delivery for the whole construction period","Im Lieferumfang für die gesamte Bauzeit","Inclus dans la fourniture pour toute la durée du chantier"],
  "je součástí dodávky pro dokončení opláštění v horním přejezdu": ["Included in the delivery for completing the cladding in the top overrun","Im Lieferumfang für die Fertigstellung der Verkleidung im oberen Schachtkopf","Inclus dans la fourniture pour la finition du bardage en partie haute de la gaine"],
  "je součástí dodávky pro provedení kompletního opláštění šachty": ["Included in the delivery for carrying out the complete shaft cladding","Im Lieferumfang für die Ausführung der kompletten Schachtverkleidung","Inclus dans la fourniture pour la réalisation du bardage complet de la gaine"],
  "je součástí dodávky pro stavbu šachty i montáž výtahu": ["Included in the delivery for both the shaft erection and the lift installation","Im Lieferumfang für den Schachtbau und die Aufzugsmontage","Inclus dans la fourniture pour le montage de la gaine et de l'ascenseur"],
  "kabina se třemi vstupy": ["Car with three entrances","Kabine mit drei Zugängen","Cabine à trois accès"],
  "kompletní opláštění šachty": ["Complete shaft cladding","Komplette Schachtverkleidung","Bardage complet de la gaine"],
  "kontaktní, hmoždiny do ŽB konstrukcí": ["Contact, dowels into reinforced concrete structures","Kontakt, Dübel in Stahlbetonkonstruktionen","Contact, chevilles dans les structures en béton armé"],
  "kontaktní, přes antivibrační podložky": ["Contact, via anti-vibration pads","Kontakt, über Schwingungsdämpfer","Contact, via des plots antivibratoires"],
  "kontaktní, přivařením k ocelovým nosníkům": ["Contact, welded to steel beams","Kontakt, an Stahlträger angeschweißt","Contact, soudé aux poutres métalliques"],
  "kotvené na vnější stranu ocelové konstrukce": ["Fixed to the outer side of the steel structure","An der Außenseite der Stahlkonstruktion befestigt","Fixé sur la face extérieure de la structure métallique"],
  "kotvy do otvorů vrtaných ve skle": ["Anchors into holes drilled in the glass","Anker in im Glas gebohrte Löcher","Ancrages dans des trous percés dans le verre"],
  "kruhový terč průměr 70 mm, lakovaný, zapuštěný pozink šroub": ["Round point fixing dia. 70 mm, painted, countersunk galvanised screw","Runder Punkthalter Ø 70 mm, lackiert, versenkte verzinkte Schraube","Patère ronde Ø 70 mm, laquée, vis galvanisée à tête fraisée"],
  "kruhový terč průměr 70 mm, nerezový, zapuštěný šroub": ["Round point fixing dia. 70 mm, stainless steel, countersunk screw","Runder Punkthalter Ø 70 mm, Edelstahl, versenkte Schraube","Patère ronde Ø 70 mm, inox, vis à tête fraisée"],
  "kruhový tvar": ["Circular shape","Runde Form","Forme circulaire"],
  "lakované lišty po obvodu skla": ["Painted trims along the glass perimeter","Lackierte Leisten am Glasumfang","Baguettes laquées sur le pourtour du verre"],
  "lesklý ochranný lak, odstín RAL 7016": ["Glossy protective paint, RAL 7016","Glänzender Schutzlack, RAL 7016","Peinture de protection brillante, teinte RAL 7016"],
  "LEŠENÍ KOLEM OCK PRO PROVEDENÍ OPLÁŠTĚNÍ": ["SCAFFOLDING AROUND THE STRUCTURE FOR CLADDING WORKS","GERÜST UM DIE STAHLKONSTRUKTION FÜR DIE VERKLEIDUNGSARBEITEN","ÉCHAFAUDAGE AUTOUR DE LA STRUCTURE POUR LA POSE DU BARDAGE"],
  "lichoběžník": ["Trapezoid","Trapez","Trapèze"],
  "lze doplnit - viz „Příplatky“": ["Can be added - see \"Surcharges\"","Kann ergänzt werden - siehe „Aufpreise“","Peut être ajouté - voir « Suppléments »"],
  "materiály DP1, opláštění s deklarovanou požární odolností EI": ["DP1 materials, cladding with declared fire resistance EI","Materialien DP1, Verkleidung mit deklariertem Feuerwiderstand EI","Matériaux DP1, bardage avec résistance au feu déclarée EI"],
  "materiály DP1, opláštění s deklarovanou požární odolností EW": ["DP1 materials, cladding with declared fire resistance EW","Materialien DP1, Verkleidung mit deklariertem Feuerwiderstand EW","Matériaux DP1, bardage avec résistance au feu déclarée EW"],
  "materiály DP1": ["DP1 materials","Materialien DP1","Matériaux DP1"],
  "matný ochranný lak v barvě RAL dle výběru objednatele": ["Matt painting in RAL colour of customer's choice","Matter Schutzlack im RAL-Farbton nach Wahl des Bestellers","Peinture de protection mate dans la teinte RAL au choix du client"],
  "matný ochranný lak, odstín RAL 7016": ["Matt protective paint, RAL 7016","Matter Schutzlack, RAL 7016","Peinture de protection mate, teinte RAL 7016"],
  "max 1500 mm": ["max 1500 mm","max. 1500 mm","max. 1500 mm"],
  "mezera 5-10 cm": ["Gap 5-10 cm","Spalt 5-10 cm","Jeu 5-10 cm"],
  "mezera max. 5 cm": ["Gap max. 5 cm","Spalt max. 5 cm","Jeu max. 5 cm"],
  "minerální izolace, VPC omítka + fasádní barva": ["Mineral insulation, lime-cement plaster + facade paint","Mineraldämmung, Kalkzementputz + Fassadenfarbe","Isolation minérale, enduit chaux-ciment + peinture de façade"],
  "mléčné sklo - hrany skel strojově broušeny": ["Opal glass - machine-ground glass edges","Milchglas - maschinell geschliffene Glaskanten","Verre opale - chants polis à la machine"],
  "mléčné sklo": ["Opal glass","Milchglas","Verre opale"],
  "na nosné základové desce nad úrovní dvora": ["On a load-bearing foundation slab above courtyard level","Auf einer tragenden Fundamentplatte über dem Hofniveau","Sur une dalle de fondation porteuse au-dessus du niveau de la cour"],
  "na nosné základové desce v úrovni dvora": ["On a load-bearing foundation slab at courtyard level","Auf einer tragenden Fundamentplatte auf Hofniveau","Sur une dalle de fondation porteuse au niveau de la cour"],
  "na nosné základové desce": ["On a load-bearing foundation slab","Auf einer tragenden Fundamentplatte","Sur une dalle de fondation porteuse"],
  "na zpevněné hraně stěn spodní části výtahové šachty": ["On the reinforced edge of the lower shaft walls","Auf dem verstärkten Rand der unteren Schachtwände","Sur le bord renforcé des parois de la partie inférieure de la gaine"],
  "NAPÁJENÍ VÝTAHU VČETNĚ REVIZNÍ ZPRÁVY": ["LIFT POWER SUPPLY INCLUDING INSPECTION REPORT","STROMVERSORGUNG DES AUFZUGS EINSCHLIESSLICH PRÜFBERICHT","ALIMENTATION ÉLECTRIQUE DE L'ASCENSEUR AVEC RAPPORT DE CONTRÔLE"],
  "nástupní můstky u protilehlých nástupišť": ["Access bridges at the opposite landings","Zugangsbrücken an den gegenüberliegenden Zugangsstellen","Passerelles d'accès aux arrêts opposés"],
  "nejsou součástí konstrukce": ["Not part of the structure","Nicht Bestandteil der Konstruktion","Ne fait pas partie de la structure"],
  "není požadováno": ["Not required","Nicht erforderlich","Non requis"],
  "není řešeno": ["Not addressed","Nicht vorgesehen","Non traité"],
  "není součást dodávky, lze doplnit viz příplatkové ceny": ["Not included in the delivery, can be added - see surcharge prices","Nicht im Lieferumfang, kann ergänzt werden - siehe Aufpreise","Non inclus dans la fourniture, peut être ajouté - voir les prix des suppléments"],
  "není součást dodávky, zajistí objednatel před montáží šachty": ["Not included in the delivery, provided by the customer before the shaft installation","Nicht im Lieferumfang, wird vom Besteller vor der Schachtmontage sichergestellt","Non inclus dans la fourniture, à la charge du client avant le montage de la gaine"],
  "není součástí dodávky, zajistí objednatel": ["Not included in the delivery, provided by the customer","Nicht im Lieferumfang, wird vom Besteller sichergestellt","Non inclus dans la fourniture, à la charge du client"],
  "nepravidelný tvar (viz nákres)": ["Irregular shape (see drawing)","Unregelmäßige Form (siehe Zeichnung)","Forme irrégulière (voir plan)"],
  "nerezové držáky do otvorů ve skle": ["Stainless steel holders into holes in the glass","Edelstahlhalter in Löcher im Glas","Fixations inox dans les trous du verre"],
  "nerezové lišty po obvodu skla": ["Stainless steel trims along the glass perimeter","Edelstahlleisten am Glasumfang","Baguettes inox sur le pourtour du verre"],
  "obdélníkový terč 80x50, lakovaný RAL 7016, zapuštěné pozink šrouby": ["Rectangular point fixing 80x50, painted RAL 7016, countersunk galvanised screws","Rechteckiger Punkthalter 80x50, lackiert RAL 7016, versenkte verzinkte Schrauben","Patère rectangulaire 80x50, laquée RAL 7016, vis galvanisées à tête fraisée"],
  "obdélníkový terč 80x50, nerezový, zapuštěné pozink šrouby": ["Rectangular point fixing 80x50, stainless steel, countersunk galvanised screws","Rechteckiger Punkthalter 80x50, Edelstahl, versenkte verzinkte Schrauben","Patère rectangulaire 80x50, inox, vis galvanisées à tête fraisée"],
  "ochranný vypalovaný lak, odstín RAL 7016": ["Baked protective paint (powder coating), RAL 7016","Einbrennschutzlack, RAL 7016","Peinture de protection thermolaquée, teinte RAL 7016"],
  "osmiúhelník": ["Octagon","Achteck","Octogone"],
  "plech v barvě shodné s nátěrem celé OCK": ["Sheet metal in the same colour as the whole steel structure","Blech in der gleichen Farbe wie die gesamte Stahlkonstruktion","Tôle de la même teinte que l'ensemble de la structure"],
  "plech v celé ploše podesty": ["Sheet metal over the whole landing area","Blech über die gesamte Podestfläche","Tôle sur toute la surface du palier"],
  "plechové lišty na bocích podest": ["Sheet metal trims on the landing sides","Blechleisten an den Podestseiten","Baguettes en tôle sur les côtés des paliers"],
  "plochá pultová střecha se sklonem na budovu, RAL 3011": ["Flat mono-pitch roof sloping towards the building, RAL 3011","Flaches Pultdach mit Gefälle zum Gebäude, RAL 3011","Toiture monopente plate inclinée vers le bâtiment, RAL 3011"],
  "plochá pultová střecha se sklonem na dvůr přetažená i přes nástupní můstek až k fasádě budovy, žlab není uvažován": ["Flat mono-pitch roof sloping towards the courtyard, extended over the access bridge up to the building facade, gutter not considered","Flaches Pultdach mit Gefälle zum Hof, über die Zugangsbrücke bis zur Gebäudefassade verlängert, Rinne nicht vorgesehen","Toiture monopente plate inclinée vers la cour, prolongée au-dessus de la passerelle jusqu'à la façade du bâtiment, gouttière non prévue"],
  "plochá pultová střecha se sklonem na dvůr, RAL 3011": ["Flat mono-pitch roof sloping towards the courtyard, RAL 3011","Flaches Pultdach mit Gefälle zum Hof, RAL 3011","Toiture monopente plate inclinée vers la cour, RAL 3011"],
  "portál mezi sloupky šachty (nepředsazený na podestu)": ["Portal between the shaft columns (not projecting onto the landing)","Portal zwischen den Schachtstielen (nicht auf das Podest vorgesetzt)","Entrée entre les poteaux de la gaine (sans saillie sur le palier)"],
  "POVRCHOVÁ ÚPRAVA KONSTRUKCE": ["STRUCTURE FINISHING","OBERFLÄCHENBEHANDLUNG DER KONSTRUKTION","FINITION DE LA STRUCTURE MÉTALLIQUE"],
  "pravoúhlý tvar, zkosené zadní rohy konstrukce": ["Rectangular shape, chamfered rear corners of the structure","Rechteckige Form, abgeschrägte hintere Ecken der Konstruktion","Forme rectangulaire, angles arrière de la structure chanfreinés"],
  "prohlubeň, podesty ve všech nástupištích a hlava šachty": ["Pit, landings at all floors and shaft head","Schachtgrube, Podeste an allen Zugangsstellen und Schachtkopf","Cuvette, paliers à tous les arrêts et tête de gaine"],
  "prohlubeň, všechny podesty, hlava šachty a sloupky zadní stěny do schodnic": ["Pit, all landings, shaft head and rear wall columns into the stair stringers","Schachtgrube, alle Podeste, Schachtkopf und Rückwandstiele in die Treppenwangen","Cuvette, tous les paliers, tête de gaine et poteaux de la paroi arrière dans les limons d'escalier"],
  "prosklení nade dveřmi a jedné straně vedle dveří": ["Glazing above the door and on one side next to the door","Verglasung über der Tür und an einer Seite neben der Tür","Vitrage au-dessus de la porte et d'un côté de la porte"],
  "prosklení nade dveřmi a obou stranách vedle dveří": ["Glazing above the door and on both sides next to the door","Verglasung über der Tür und an beiden Seiten neben der Tür","Vitrage au-dessus de la porte et des deux côtés de la porte"],
  "protisluneční sklo Cool Lite, Ug=1,1 W/m2.K": ["Solar control glass Cool Lite, Ug=1.1 W/m2.K","Sonnenschutzglas Cool Lite, Ug=1,1 W/m2.K","Verre de contrôle solaire Cool Lite, Ug=1,1 W/m2.K"],
  "provede kompletně stavba po montáži šachetních dveří": ["Carried out entirely by the building contractor after the landing doors are installed","Wird nach der Montage der Schachttüren komplett bauseits ausgeführt","Entièrement réalisé par l'entreprise de construction après la pose des portes palières"],
  "průběžná, vedle podest, k jedné podestě nástupní můstek": ["Continuous, next to the landings, with an access bridge to one landing","Durchgehend, neben den Podesten, zu einem Podest mit Zugangsbrücke","Continue, le long des paliers, avec une passerelle vers un palier"],
  "průběžná, vedle schodiště/podest": ["Continuous, next to the staircase / landings","Durchgehend, neben der Treppe / den Podesten","Continue, le long de l'escalier / des paliers"],
  "předsazené před ocelovou konstrukci o cca 30 mm": ["Mounted approx. 30 mm in front of the steel structure","Ca. 30 mm vor die Stahlkonstruktion vorgesetzt","Posé en saillie d'environ 30 mm devant la structure métallique"],
  "předsazený portál": ["Projecting portal","Vorgesetztes Portal","Entrée en saillie"],
  "PŘÍPRAVA PRO KOTVENÍ VÝTAHU": ["PREPARATION FOR LIFT FIXING","VORBEREITUNG FÜR DIE AUFZUGSBEFESTIGUNG","PRÉPARATION POUR LA FIXATION DE L'ASCENSEUR"],
  "přisazena k fasádě (bez opláštění)": ["Attached to the facade (without cladding)","An die Fassade angebaut (ohne Verkleidung)","Accolée à la façade (sans bardage)"],
  "přisazena k fasádě (dle odchylky podest od svislice)": ["Attached to the facade (following the vertical deviation of the landings)","An die Fassade angebaut (entsprechend der Lotabweichung der Podeste)","Accolée à la façade (selon l'écart de verticalité des paliers)"],
  "přisazena k fasádě, v nejvyšším nástupišti přes můstek": ["Attached to the facade, at the topmost landing via an access bridge","An die Fassade angebaut, an der obersten Zugangsstelle über eine Brücke","Accolée à la façade, à l'arrêt le plus haut par une passerelle"],
  "přisazena k podestám, v některých nástupištích přes můstky": ["Attached to the landings, at some floors via access bridges","An die Podeste angebaut, an einigen Zugangsstellen über Brücken","Accolée aux paliers, à certains arrêts par passerelles"],
  "reflexní vrstva pro omezení přehřívání interiéru šachty vlivem slunečního svitu": ["Reflective coating to limit overheating of the shaft interior caused by sunlight","Reflexionsschicht zur Begrenzung der Aufheizung des Schachtinnenraums durch Sonneneinstrahlung","Couche réfléchissante limitant la surchauffe intérieure de la gaine due au soleil"],
  "rovnoměrné rozdělení dle podlaží": ["Even distribution according to the floors","Gleichmäßige Verteilung nach Geschossen","Répartition régulière selon les étages"],
  "ROZMĚR ŠACHTY – VNĚJŠÍ [mm] *": ["SHAFT DIMENSIONS – EXTERNAL [mm] *","SCHACHTABMESSUNGEN – AUSSEN [mm] *","DIMENSIONS DE LA GAINE – EXTÉRIEURES [mm] *"],
  "ROZMĚR ŠACHTY – VNITŘNÍ [mm] *": ["SHAFT DIMENSIONS – INTERNAL [mm] *","SCHACHTABMESSUNGEN – INNEN [mm] *","DIMENSIONS DE LA GAINE – INTÉRIEURES [mm] *"],
  "řeší objednatel": ["Handled by the customer","Wird vom Besteller ausgeführt","Réalisé par le client"],
  "řeší stavba": ["Provided by the building contractor","Wird bauseits ausgeführt","Réalisé par l'entreprise de construction"],
  "s nástupními můstky ve všech nadzemních nástupištích": ["With access bridges at all above-ground landings","Mit Zugangsbrücken an allen oberirdischen Zugangsstellen","Avec passerelles d'accès à tous les arrêts en étage"],
  "sádrovláknité desky": ["Gypsum fibre boards","Gipsfaserplatten","Plaques de fibres-gypse"],
  "standardní čirá skla, Ug=2,6 W/m2.K": ["Standard clear glass, Ug=2.6 W/m2.K","Standard-Klarglas, Ug=2,6 W/m2.K","Verre clair standard, Ug=2,6 W/m2.K"],
  "stávající zděný portál": ["Existing masonry portal","Bestehendes gemauertes Portal","Entrée maçonnée existante"],
  "stejné jako šachta": ["Same as the shaft","Wie der Schacht","Identique à la gaine"],
  "svařovaná": ["Welded","Geschweißt","Soudée"],
  "světlík na jedné straně š. dveří": ["Transom light on one side of the landing door","Oberlicht an einer Seite der Schachttür","Imposte vitrée d'un côté de la porte palière"],
  "světlík na obou stranách š. dveří": ["Transom light on both sides of the landing door","Oberlicht an beiden Seiten der Schachttür","Imposte vitrée des deux côtés de la porte palière"],
  "světlík nade dveřmi a na jedné straně š. dveří": ["Transom light above the door and on one side of the landing door","Oberlicht über der Tür und an einer Seite der Schachttür","Imposte vitrée au-dessus de la porte et d'un côté de la porte palière"],
  "světlík nade dveřmi a na obou stranách š. dveří": ["Transom light above the door and on both sides of the landing door","Oberlicht über der Tür und an beiden Seiten der Schachttür","Imposte vitrée au-dessus de la porte et des deux côtés de la porte palière"],
  "světlík nade dveřmi": ["Transom light above the door","Oberlicht über der Tür","Imposte vitrée au-dessus de la porte"],
  "šestiúhelník": ["Hexagon","Sechseck","Hexagone"],
  "tmelené a broušené styky desek, bílý nátěr aplikovaný na stavbě": ["Filled and sanded board joints, white paint applied on site","Verspachtelte und geschliffene Plattenstöße, weißer Anstrich bauseits","Joints de panneaux enduits et poncés, peinture blanche appliquée sur chantier"],
  "TYP KONSTRUKCE (ENG-M)": ["STRUCTURE TYPE (ENG-M)","KONSTRUKTIONSTYP (ENG-M)","TYPE DE STRUCTURE (ENG-M)"],
  "USAZENÍ OCK – LEVÁ BOČNÍ STĚNA": ["SHAFT STRUCTURE POSITION – LEFT SIDE WALL","POSITIONIERUNG DER SCHACHTKONSTRUKTION – LINKE SEITENWAND","FIXATION DE LA STRUCTURE DE GAINE – PAROI LATÉRALE GAUCHE"],
  "USAZENÍ OCK – PRAVÁ BOČNÍ STĚNA": ["SHAFT STRUCTURE POSITION – RIGHT SIDE WALL","POSITIONIERUNG DER SCHACHTKONSTRUKTION – RECHTE SEITENWAND","FIXATION DE LA STRUCTURE DE GAINE – PAROI LATÉRALE DROITE"],
  "USAZENÍ OCK – ZADNÍ STĚNA": ["SHAFT STRUCTURE POSITION – REAR WALL","POSITIONIERUNG DER SCHACHTKONSTRUKTION – RÜCKWAND","FIXATION DE LA STRUCTURE DE GAINE – PAROI ARRIÈRE"],
  "v exteriéru, přisazena k fasádě přes nástupní můstky + podchozí nosná OCK": ["Outdoor, attached to the facade via access bridges + supporting structure with a walk-through space beneath","Im Außenbereich, über Zugangsbrücken an die Fassade angebaut + Stützkonstruktion mit Durchgang darunter","À l'extérieur, accolée à la façade par des passerelles d'accès + structure porteuse avec passage en dessous"],
  "v exteriéru, přisazena k fasádě přes nástupní můstky": ["Outdoor, attached to the facade via access bridges","Im Außenbereich, über Zugangsbrücken an die Fassade angebaut","À l'extérieur, accolée à la façade par des passerelles d'accès"],
  "v exteriéru, přisazena k fasádě, umístěna na podchozí nosné OCK": ["Outdoor, attached to the facade, placed on a supporting structure with a walk-through space beneath","Im Außenbereich, an die Fassade angebaut, auf einer Stützkonstruktion mit Durchgang darunter","À l'extérieur, accolée à la façade, posée sur une structure porteuse avec passage en dessous"],
  "v exteriéru, přisazena k fasádě": ["Outdoor, attached to the facade","Im Außenbereich, an die Fassade angebaut","À l'extérieur, accolée à la façade"],
  "v exteriéru": ["Outdoor","Im Außenbereich","À l'extérieur"],
  "v horní části OCK výtahové šachty (bezstrojovnový výtah)": ["In the upper part of the lift shaft steel structure (machine-room-less lift)","Im oberen Teil der Aufzugsschacht-Stahlkonstruktion (maschinenraumloser Aufzug)","Dans la partie supérieure de la structure de gaine (ascenseur sans local des machines)"],
  "v interiéru - v ATRIU domu": ["Indoor – in the building ATRIUM","Im Innenbereich – im ATRIUM des Gebäudes","À l'intérieur – dans l'ATRIUM du bâtiment"],
  "v interiéru - v zrcadle schodiště": ["Indoor – in the stairwell void","Im Innenbereich – im Treppenauge","À l'intérieur – dans le jour d'escalier"],
  "v interiéru": ["Indoor","Im Innenbereich","À l'intérieur"],
  "v prohlubni výtahové šachty (bezstrojovnový výtah)": ["In the lift shaft pit (machine-room-less lift)","In der Schachtgrube (maschinenraumloser Aufzug)","Dans la cuvette de la gaine (ascenseur sans local des machines)"],
  "v původní strojovně nad šachtou": ["In the original machine room above the shaft","Im ursprünglichen Maschinenraum über dem Schacht","Dans le local des machines d'origine au-dessus de la gaine"],
  "v samostatné části vedle výtahové šachty": ["In a separate area next to the lift shaft","In einem separaten Bereich neben dem Aufzugsschacht","Dans une zone séparée à côté de la gaine d'ascenseur"],
  "viz příplatky": ["See surcharges","Siehe Aufpreise","Voir suppléments"],
  "vložené mezi ocelové profily konstrukce": ["Inserted between the steel profiles of the structure","Zwischen die Stahlprofile der Konstruktion eingesetzt","Inséré entre les profilés acier de la structure"],
  "VNĚJŠÍ OPLÁŠTĚNÍ ŠACHTY": ["EXTERNAL SHAFT CLADDING","AUSSENVERKLEIDUNG DES SCHACHTS","BARDAGE EXTÉRIEUR DE LA GAINE"],
  "vodorovné zakrytí horního rámu plechem v barvě OCK": ["Horizontal covering of the top frame with sheet metal in the colour of the steel structure","Waagerechte Abdeckung des oberen Rahmens mit Blech in der Farbe der Stahlkonstruktion","Couverture horizontale du cadre supérieur par une tôle dans la teinte de la structure"],
  "vrstvené bezp. sklo ESG (kalené) s vrtanými otvory": ["Toughened safety glass ESG with drilled holes","Einscheibensicherheitsglas ESG (gehärtet) mit gebohrten Löchern","Verre de sécurité trempé ESG avec trous percés"],
  "vrstvené bezpečnostní sklo VSG (v souladu i s ČSN 74 3305)": ["Laminated safety glass VSG (also compliant with ČSN 74 3305)","Verbundsicherheitsglas VSG (auch nach ČSN 74 3305)","Verre feuilleté de sécurité VSG (conforme également à la ČSN 74 3305)"],
  "vrstvené bezpečnostní sklo VSG vsazené do rámečků": ["Laminated safety glass VSG set in frames","Verbundsicherheitsglas VSG in Rahmen eingesetzt","Verre feuilleté de sécurité VSG posé dans des cadres"],
  "vrstvené bezpečnostní sklo VSG": ["Laminated safety glass VSG","Verbundsicherheitsglas VSG","Verre feuilleté de sécurité VSG"],
  "vycentrováno do prostoru zrcadla schodiště": ["Centred in the stairwell void","Im Treppenauge zentriert","Centrée dans le jour d'escalier"],
  "zajistí objednatel v rámci SP": ["Provided by the customer as part of the site preparation","Wird vom Besteller im Rahmen der Bauvorbereitung sichergestellt","À la charge du client dans le cadre de la préparation du chantier"],
  "zajistí objednatel": ["Provided by the customer","Wird vom Besteller sichergestellt","À la charge du client"],
  "zůstane zachováno": ["Will be retained","Bleibt erhalten","Sera conservé"],

  /* ---- ZAK-2: porovnání variant vedle sebe (tiskový pohled) ---- */
  "Porovnání variant": ["Comparison of options","Variantenvergleich","Comparatif des variantes"],
  "řídící varianta": ["governing option","maßgebende Variante","variante de référence"],
  "rozdíl": ["difference","Differenz","écart"],
  "Rozdíl je počítán proti řídící variantě.": ["Differences are calculated against the governing option.","Die Differenzen beziehen sich auf die maßgebende Variante.","Les écarts sont calculés par rapport à la variante de référence."],
  "Ceny jsou v Kč.": ["Prices are in CZK.","Preise in CZK.","Prix en CZK."],
  "Tisk / Uložit jako PDF": ["Print / Save as PDF","Drucken / Als PDF speichern","Imprimer / Enregistrer en PDF"],
  "Základní cena OCK bez DPH": ["Base price of the steel shaft structure excl. VAT","Grundpreis der Aufzugsschachtkonstruktion ohne MwSt.","Prix de base de la structure métallique de gaine HT"],
  "Schválená sleva": ["Approved discount","Genehmigter Rabatt","Remise approuvée"],
  "Sleva v Kč": ["Discount in CZK","Rabatt in CZK","Remise en CZK"],
  "Cena OCK po slevě": ["Price of the steel shaft structure after discount","Preis der Aufzugsschachtkonstruktion nach Rabatt","Prix de la structure métallique de gaine après remise"],
  "Náklad OCK": ["Cost of the steel shaft structure","Kosten der Aufzugsschachtkonstruktion","Coût de la structure métallique de gaine"],
  "Marže OCK po slevě": ["Margin on the steel shaft structure after discount","Marge der Aufzugsschachtkonstruktion nach Rabatt","Marge sur la structure métallique de gaine après remise"],
  "Marže OCK po slevě v %": ["Margin on the steel shaft structure after discount in %","Marge der Aufzugsschachtkonstruktion nach Rabatt in %","Marge sur la structure métallique de gaine après remise en %"],
  "Kalkulace PROJ celkem": ["Design works, total","Planungsleistungen gesamt","Prestations d'études, total"],
  "Z toho obchodní zaokrouhlení": ["Of which commercial rounding","Davon kaufmännische Rundung","Dont arrondi commercial"],
  "Obchodní zaokrouhlení": ["Commercial rounding","Kaufmännische Rundung","Arrondi commercial"],
  "Spočtená cena": ["Calculated price","Berechneter Preis","Prix calculé"],
  "Celkem bez DPH": ["Total excl. VAT","Gesamt ohne MwSt.","Total HT"],
  "Sazba DPH": ["VAT rate","MwSt.-Satz","Taux de TVA"],
  "DPH v Kč": ["VAT in CZK","MwSt. in CZK","TVA en CZK"],
  /* DPH po částech v porovnání variant (audit 1. 8. 2026, N3). Odvozeno
   * ze schválených hesel „Sazba DPH" / „DPH v Kč"; do slovníku (xlsx) zanést
   * při nejbližší synchronizaci. */
  "Sazba DPH OCK": ["VAT rate (shaft steel structure)","MwSt.-Satz (Schachtstahlkonstruktion)","Taux de TVA (structure de la gaine)"],
  "DPH OCK v Kč": ["VAT in CZK (shaft steel structure)","MwSt. in CZK (Schachtstahlkonstruktion)","TVA en CZK (structure de la gaine)"],
  "Sazba DPH PROJ": ["VAT rate (design work)","MwSt.-Satz (Planungsleistungen)","Taux de TVA (études)"],
  "DPH PROJ v Kč": ["VAT in CZK (design work)","MwSt. in CZK (Planungsleistungen)","TVA en CZK (études)"],
  "Celkem s DPH": ["Total incl. VAT","Gesamt inkl. MwSt.","Total TTC"],
  "Příplatky nad rámec základní ceny": ["Optional extras beyond the base price","Aufpreise über den Grundpreis hinaus","Suppléments au-delà du prix de base"],

  /* ---- ZAK-2b: detail konkrétních položek, které se mezi variantami liší ---- */
  "Detail položek": ["Line item detail","Positionsdetail","Détail des postes"],
  "Název": ["Name","Bezeichnung","Désignation"],
  "Stav": ["Status","Status","Statut"],
  "Položka": ["Item","Position","Poste"],
  "Jednotková cena": ["Unit price","Einheitspreis","Prix unitaire"],
  "Cena položky": ["Item price","Positionspreis","Prix du poste"],
  "Náklad položky": ["Item cost","Positionskosten","Coût du poste"],
  "přidáno": ["added","hinzugefügt","ajouté"],
  "odebráno": ["removed","entfernt","supprimé"],
  "změněno": ["changed","geändert","modifié"],
  "beze změny": ["unchanged","unverändert","inchangé"],
  "Hrubá stavba OCK": ["Steel shaft structure – shell","Aufzugsschachtkonstruktion – Rohbau","Structure métallique de gaine – gros œuvre"],
  "Opláštění": ["Cladding","Verkleidung","Habillage"],
  "Volitelné položky": ["Optional items","Optionale Positionen","Postes optionnels"],
  "Režie a přípravné práce": ["Overheads and preparatory works","Gemeinkosten und Vorarbeiten","Frais généraux et travaux préparatoires"],
  "Varianta je položkově shodná s řídící variantou.": ["This option is identical to the governing option at line item level.","Diese Variante ist auf Positionsebene mit der maßgebenden Variante identisch.","Cette variante est identique à la variante de référence au niveau des postes."],
  "Položky beze změny se neuvádějí.": ["Unchanged items are not listed.","Unveränderte Positionen werden nicht aufgeführt.","Les postes inchangés ne sont pas listés."],

  /* ---- SET-3: firemní údaje zhotovitele (Nastavení → Firma, sekce DODAVATEL) ----
   * Pozor: „Vypracoval“ se ZÁMĚRNĚ nedoplňuje – ve slovníku už je heslo
   * „vypracoval“ a vyhledávání je necitlivé na velikost písmen (kolize). */
  "DODAVATEL": ["SUPPLIER","LIEFERANT","FOURNISSEUR"],
  "Název firmy": ["Company name","Firmenname","Raison sociale"],
  "IČO": ["Company ID No.","Ident.-Nr.","N° d'identification"],
  "DIČ": ["VAT No.","USt-IdNr.","N° de TVA"],
  "Zápis v obchodním rejstříku": ["Commercial register entry","Handelsregistereintrag","Inscription au registre du commerce"],
  "Sídlo": ["Registered office","Firmensitz","Siège social"],
  "Korespondenční adresa": ["Mailing address","Postanschrift","Adresse postale"],
  "Bankovní spojení": ["Bank details","Bankverbindung","Coordonnées bancaires"],
  "Telefon": ["Phone","Telefon","Téléphone"],
  "E-mail": ["E-mail","E-Mail","E-mail"],
  "Web": ["Website","Web","Site web"],
  "Česká republika": ["Czech Republic","Tschechische Republik","République tchèque"],

  /* ---- tiskový náhled celé cenové nabídky (N1 – jazykové mutace) ---- */
  "Podklady nabídky": ["Quotation data","Angebotsunterlagen","Données de l'offre"],
  "Přesně tyto hodnoty se vyplní do šablony nabídky. Tlačítkem výše vytisknete do PDF.": ["These exact values are inserted into the quotation template. Use the button above to print to PDF.","Genau diese Werte werden in die Angebotsvorlage übernommen. Mit der Schaltfläche oben drucken Sie als PDF.","Ce sont exactement ces valeurs qui seront insérées dans le modèle d'offre. Le bouton ci-dessus permet d'imprimer en PDF."],
  "HLAVIČKA NABÍDKY": ["QUOTATION HEADER","ANGEBOTSKOPF","EN-TÊTE DE L'OFFRE"],
  "Kontaktní osoba": ["Contact person","Ansprechpartner","Personne de contact"],
  "B. OBCHODNÍ ČÁST – CENOVÁ NABÍDKA": ["B. COMMERCIAL SECTION – PRICE QUOTATION","B. KAUFMÄNNISCHER TEIL – PREISANGEBOT","B. PARTIE COMMERCIALE – OFFRE DE PRIX"],
  "Výtahová šachta (bez DPH)": ["Lift shaft (excl. VAT)","Aufzugsschacht (ohne MwSt.)","Gaine d'ascenseur (hors TVA)"],
  "CELKEM za nabídku (včetně DPH)": ["TOTAL for the quotation (incl. VAT)","GESAMT für das Angebot (inkl. MwSt.)","TOTAL de l'offre (TVA comprise)"],
  "ROZŠÍŘENÍ CENOVÉ NABÍDKY – PŘÍPLATKY": ["QUOTATION EXTENSIONS – SURCHARGES","ERWEITERUNG DES ANGEBOTS – ZUSCHLÄGE","EXTENSIONS DE L'OFFRE – SUPPLÉMENTS"],
  "Tisk specifikace / PDF": ["Print specification / PDF","Spezifikation drucken / PDF","Imprimer la spécification / PDF"],
  "šířka": ["width","Breite","largeur"],
  "hloubka": ["depth","Tiefe","profondeur"],
  "sazba": ["rate","Satz","taux"],

  /* ---- názvy příplatků a volitelných položek v nabídce ---- */
  "Sklo VSG s mléčnou fólií": ["Laminated safety glass with opal film","VSG-Glas mit Milchfolie","Verre feuilleté avec film opalin"],
  "Sklo SKN 176 (Ug=1,1) (EXT)": ["SKN 176 glass (Ug=1.1) (EXT)","Glas SKN 176 (Ug=1,1) (EXT)","Verre SKN 176 (Ug=1,1) (EXT)"],
  "MADLA NA BOČNÍCH STĚNÁCH (dřevo, lak)": ["HANDRAILS ON SIDE WALLS (wood, lacquered)","HANDLÄUFE AN DEN SEITENWÄNDEN (Holz, lackiert)","MAINS COURANTES SUR LES PAROIS LATÉRALES (bois, laqué)"],
  "MADLA NA ZADNÍ STĚNĚ (dřevo, lak)": ["HANDRAILS ON THE REAR WALL (wood, lacquered)","HANDLÄUFE AN DER RÜCKWAND (Holz, lackiert)","MAINS COURANTES SUR LA PAROI ARRIÈRE (bois, laqué)"],
  "PŘÍPLATEK ZA STŘECHU V MĚDI (EXT)": ["SURCHARGE FOR COPPER ROOF (EXT)","ZUSCHLAG FÜR KUPFERDACH (EXT)","SUPPLÉMENT POUR TOITURE EN CUIVRE (EXT)"],
  "VENTILÁTOR (EXT)": ["FAN (EXT)","VENTILATOR (EXT)","VENTILATEUR (EXT)"],
  "MONTÁŽ ŠACHETNÍCH DVEŘÍ": ["LANDING DOOR INSTALLATION","MONTAGE DER SCHACHTTÜREN","MONTAGE DES PORTES PALIÈRES"],
  "LEŠENÍ - dokončení hlavy šachty": ["SCAFFOLDING – shaft head completion","GERÜST – Fertigstellung des Schachtkopfes","ÉCHAFAUDAGE – finition de la tête de gaine"],
  "LEŠENÍ - vnější": ["SCAFFOLDING – external","GERÜST – außen","ÉCHAFAUDAGE – extérieur"],

  /* ---- TS-1: kontrola vyplnění technické specifikace (jen upozornění) ---- */
  "Kontrola vyplnění": ["Completeness check","Vollständigkeitsprüfung","Contrôle de complétude"],
  "Všechna povinná pole jsou vyplněna.": ["All mandatory fields are filled in.","Alle Pflichtfelder sind ausgefüllt.","Tous les champs obligatoires sont remplis."],
  "Nevyplněná povinná pole": ["Unfilled mandatory fields","Nicht ausgefüllte Pflichtfelder","Champs obligatoires non remplis"],
  "Upozornění nic neblokuje – dokument lze vytisknout i takto.": ["This is a warning only – the document can still be printed.","Dies ist nur ein Hinweis – das Dokument kann trotzdem gedruckt werden.","Il s'agit d'un simple avertissement – le document peut être imprimé tel quel."],
  "nevyplněno": ["not filled in","nicht ausgefüllt","non rempli"],
  "HLAVIČKA DOKUMENTU": ["DOCUMENT HEADER","DOKUMENTKOPF","EN-TÊTE DU DOCUMENT"],

  /* ---- B1: cenová nabídka PROJ (OVP-CN) podle VZORu ENGINEERS CZ ----
   * Přeloženy jsou NADPISY oddílů, cenové popisky a krátké obchodní výrazy.
   * Souvislá právní a technická próza (odstavce, poznámky) zůstává záměrně
   * česky – viz { cz: … } v nabidka_proj.js. Podrobné popisy rozsahu činností
   * zatím přeložené nejsou; objeví se v exportu chybějících hesel jako
   * podklad pro překladatele (nic se nevymýšlí). */
  "CENOVÁ NABÍDKA": ["PRICE QUOTATION","PREISANGEBOT","OFFRE DE PRIX"],
  "Popis záměru": ["Project description","Beschreibung des Vorhabens","Description du projet"],
  "Popis záměru zatím není vyplněn – doplňte jej v kartě Zakázka.": ["The project description has not been filled in yet – add it in the Order tab.","Die Beschreibung des Vorhabens ist noch nicht ausgefüllt – ergänzen Sie sie im Reiter Auftrag.","La description du projet n'est pas encore renseignée – complétez-la dans l'onglet Affaire."],
  "Naše NABÍDKA a doporučení": ["Our OFFER and recommendation","Unser ANGEBOT und unsere Empfehlung","Notre OFFRE et nos recommandations"],
  "ROZSAH NABÍDKY": ["SCOPE OF THE OFFER","LEISTUNGSUMFANG DES ANGEBOTS","ÉTENDUE DE L'OFFRE"],
  "ROZŠÍŘENÁ NABÍDKA": ["EXTENDED OFFER","ERWEITERTES ANGEBOT","OFFRE ÉTENDUE"],
  "ZAMĚŘENÍ A ZPRACOVÁNÍ VÝSTUPŮ (ZA)": ["SURVEY AND PROCESSING OF OUTPUTS (ZA)","AUFMASS UND AUSWERTUNG (ZA)","RELEVÉ ET TRAITEMENT DES LIVRABLES (ZA)"],
  "CENA ZA ZAMĚŘENÍ A ZPRACOVÁNÍ VÝSTUPŮ": ["PRICE FOR THE SURVEY AND PROCESSING OF OUTPUTS","PREIS FÜR AUFMASS UND AUSWERTUNG","PRIX DU RELEVÉ ET DU TRAITEMENT DES LIVRABLES"],
  "STUDIE PROVEDITELNOSTI (ST)": ["FEASIBILITY STUDY (ST)","MACHBARKEITSSTUDIE (ST)","ÉTUDE DE FAISABILITÉ (ST)"],
  "CENA ZA STUDII PROVEDITELNOSTI – část 1": ["PRICE FOR THE FEASIBILITY STUDY – part 1","PREIS FÜR DIE MACHBARKEITSSTUDIE – Teil 1","PRIX DE L'ÉTUDE DE FAISABILITÉ – partie 1"],
  "CENA ZA STUDII PROVEDITELNOSTI – část 2": ["PRICE FOR THE FEASIBILITY STUDY – part 2","PREIS FÜR DIE MACHBARKEITSSTUDIE – Teil 2","PRIX DE L'ÉTUDE DE FAISABILITÉ – partie 2"],
  "CENA ZA STUDII PROVEDITELNOSTI – část 3": ["PRICE FOR THE FEASIBILITY STUDY – part 3","PREIS FÜR DIE MACHBARKEITSSTUDIE – Teil 3","PRIX DE L'ÉTUDE DE FAISABILITÉ – partie 3"],
  "STUDIE PROVEDITELNOSTI – variantní řešení": ["FEASIBILITY STUDY – alternative solutions","MACHBARKEITSSTUDIE – Variantenlösung","ÉTUDE DE FAISABILITÉ – solutions variantes"],
  "ZAMĚŘENÍ a zpracování výstupů": ["SURVEY and processing of outputs","AUFMASS und Auswertung","RELEVÉ et traitement des livrables"],
  "Vypracování STUDIE PROVEDITELNOSTI": ["Preparation of the FEASIBILITY STUDY","Erstellung der MACHBARKEITSSTUDIE","Élaboration de l'ÉTUDE DE FAISABILITÉ"],
  "DOKUMENTACE PRO POVOLENÍ ZÁMĚRU (DPZ)": ["DOCUMENTATION FOR THE PROJECT PERMIT (DPZ)","UNTERLAGEN FÜR DIE VORHABENGENEHMIGUNG (DPZ)","DOSSIER DE DEMANDE D'AUTORISATION (DPZ)"],
  "CENA ZA DOKUMENTACI PRO POVOLENÍ ZÁMĚRU (DPZ)": ["PRICE FOR THE DOCUMENTATION FOR THE PROJECT PERMIT (DPZ)","PREIS FÜR DIE UNTERLAGEN ZUR VORHABENGENEHMIGUNG (DPZ)","PRIX DU DOSSIER DE DEMANDE D'AUTORISATION (DPZ)"],
  "INŽENÝRSKÁ ČINNOST (IČ)": ["ENGINEERING SERVICES (IČ)","INGENIEURLEISTUNGEN (IČ)","ASSISTANCE ADMINISTRATIVE (IČ)"],
  "CENA ZA INŽENÝRSKOU ČINNOST (IČ)": ["PRICE FOR THE ENGINEERING SERVICES (IČ)","PREIS FÜR DIE INGENIEURLEISTUNGEN (IČ)","PRIX DE L'ASSISTANCE ADMINISTRATIVE (IČ)"],
  "Vyřízení POVOLENÍ ZÁMĚRU": ["Obtaining the PROJECT PERMIT","Erwirkung der VORHABENGENEHMIGUNG","Obtention de l'AUTORISATION DU PROJET"],
  "DOKUMENTACE PRO PROVEDENÍ STAVBY (DPS)": ["DETAILED DESIGN DOCUMENTATION (DPS)","AUSFÜHRUNGSPLANUNG (DPS)","DOSSIER D'EXÉCUTION (DPS)"],
  "CENA ZA DOKUMENTACI PRO PROVEDENÍ STAVBY (DPS)": ["PRICE FOR THE DETAILED DESIGN DOCUMENTATION (DPS)","PREIS FÜR DIE AUSFÜHRUNGSPLANUNG (DPS)","PRIX DU DOSSIER D'EXÉCUTION (DPS)"],
  "EKONOMICKÁ ZADÁVACÍ ČÁST (EZC)": ["TENDER COST DOCUMENTS (EZC)","WIRTSCHAFTLICHER AUSSCHREIBUNGSTEIL (EZC)","PIÈCES ÉCONOMIQUES DE CONSULTATION (EZC)"],
  "CENA ZA EKONOMICKOU ZADÁVACÍ ČÁST (EZC)": ["PRICE FOR THE TENDER COST DOCUMENTS (EZC)","PREIS FÜR DEN WIRTSCHAFTLICHEN AUSSCHREIBUNGSTEIL (EZC)","PRIX DES PIÈCES ÉCONOMIQUES DE CONSULTATION (EZC)"],
  "Ekonomická zadávací část (rozpočet a výkaz výměr)": ["Tender cost documents (budget and bill of quantities)","Wirtschaftlicher Ausschreibungsteil (Kostenermittlung und Leistungsverzeichnis)","Pièces économiques de consultation (budget et métré)"],
  "ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ": ["ARRANGING THE FINAL BUILDING APPROVAL","ABWICKLUNG DER BAUABNAHME","ORGANISATION DE LA RÉCEPTION DES TRAVAUX"],
  "CENA ZA ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ": ["PRICE FOR ARRANGING THE FINAL BUILDING APPROVAL","PREIS FÜR DIE ABWICKLUNG DER BAUABNAHME","PRIX DE L'ORGANISATION DE LA RÉCEPTION DES TRAVAUX"],
  "KOLAUDAČNÍ ŘÍZENÍ": ["Final building approval procedure","Bauabnahmeverfahren","Procédure de réception des travaux"],
  "GEODETICKÉ ZAMĚŘENÍ": ["LAND SURVEY","GEODÄTISCHE VERMESSUNG","RELEVÉ GÉOMÈTRE"],
  "CENA ZA GEODETICKÉ ZAMĚŘENÍ": ["PRICE FOR THE LAND SURVEY","PREIS FÜR DIE GEODÄTISCHE VERMESSUNG","PRIX DU RELEVÉ GÉOMÈTRE"],
  "Geodetické zaměření a geometrický plán": ["Land survey and cadastral plan","Geodätische Vermessung und Lageplan","Relevé géomètre et plan de bornage"],
  "AUTORSKÝ DOZOR (AD)": ["DESIGNER'S SITE SUPERVISION (AD)","PLANERISCHE OBJEKTÜBERWACHUNG (AD)","SUIVI ARCHITECTURAL (AD)"],
  "MĚSÍČNÍ SAZBA ZA AUTORSKÝ DOZOR (AD)": ["MONTHLY RATE FOR THE DESIGNER'S SITE SUPERVISION (AD)","MONATSSATZ FÜR DIE PLANERISCHE OBJEKTÜBERWACHUNG (AD)","TARIF MENSUEL DU SUIVI ARCHITECTURAL (AD)"],
  "CENA NEZAHRNUJE": ["THE PRICE DOES NOT INCLUDE","IM PREIS NICHT ENTHALTEN","LE PRIX NE COMPREND PAS"],
  "POŽADOVÁNO OD INVESTORA": ["REQUIRED FROM THE CLIENT","VOM BAUHERRN BENÖTIGT","REQUIS DE LA PART DU MAÎTRE D'OUVRAGE"],
  "DPH, SPLATNOST FAKTUR A PLATNOST NABÍDKY": ["VAT, PAYMENT TERMS AND VALIDITY OF THE OFFER","MWST., ZAHLUNGSZIEL UND GÜLTIGKEIT DES ANGEBOTS","TVA, DÉLAI DE PAIEMENT ET VALIDITÉ DE L'OFFRE"],
  "Současně platná sazba DPH": ["Currently applicable VAT rate","Derzeit gültiger MwSt.-Satz","Taux de TVA en vigueur"],
  "Splatnost faktur": ["Invoice due date","Zahlungsziel der Rechnungen","Échéance des factures"],
  "Platnost nabídky": ["Validity of the offer","Gültigkeit des Angebots","Validité de l'offre"],
  "PLATEBNÍ PODMÍNKY ZAMĚŘENÍ": ["PAYMENT TERMS – SURVEY","ZAHLUNGSBEDINGUNGEN – AUFMASS","CONDITIONS DE PAIEMENT – RELEVÉ"],
  "PLATEBNÍ PODMÍNKY STUDIE PROVEDITELNOSTI (SP)": ["PAYMENT TERMS – FEASIBILITY STUDY (SP)","ZAHLUNGSBEDINGUNGEN – MACHBARKEITSSTUDIE (SP)","CONDITIONS DE PAIEMENT – ÉTUDE DE FAISABILITÉ (SP)"],
  "PLATEBNÍ PODMÍNKY DPZ": ["PAYMENT TERMS – DPZ","ZAHLUNGSBEDINGUNGEN – DPZ","CONDITIONS DE PAIEMENT – DPZ"],
  "PLATEBNÍ PODMÍNKY INŽENÝRSKÉ ČINNOSTI (IČ)": ["PAYMENT TERMS – ENGINEERING SERVICES (IČ)","ZAHLUNGSBEDINGUNGEN – INGENIEURLEISTUNGEN (IČ)","CONDITIONS DE PAIEMENT – ASSISTANCE ADMINISTRATIVE (IČ)"],
  "PLATEBNÍ PODMÍNKY DPS A EZC": ["PAYMENT TERMS – DPS AND EZC","ZAHLUNGSBEDINGUNGEN – DPS UND EZC","CONDITIONS DE PAIEMENT – DPS ET EZC"],
  "PLATEBNÍ PODMÍNKY PRO ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ": ["PAYMENT TERMS – FINAL BUILDING APPROVAL","ZAHLUNGSBEDINGUNGEN – BAUABNAHME","CONDITIONS DE PAIEMENT – RÉCEPTION DES TRAVAUX"],
  "PLATEBNÍ PODMÍNKY AUTORSKÉHO DOZORU": ["PAYMENT TERMS – DESIGNER'S SITE SUPERVISION","ZAHLUNGSBEDINGUNGEN – PLANERISCHE OBJEKTÜBERWACHUNG","CONDITIONS DE PAIEMENT – SUIVI ARCHITECTURAL"],
  "TERMÍNY": ["SCHEDULE","TERMINE","DÉLAIS"],
  "REKAPITULACE CENOVÉ NABÍDKY": ["SUMMARY OF THE PRICE QUOTATION","ZUSAMMENFASSUNG DES PREISANGEBOTS","RÉCAPITULATIF DE L'OFFRE DE PRIX"],
  /* "CELKEM bez DPH" / "CELKEM s DPH" se NEpřidávají – normalizace klíčů
   * (prekladNorm) je case-insensitive, takže se použijí již existující hesla
   * "Celkem bez DPH" / "Celkem s DPH" výše. Duplicitní zápis by byl kolize. */
  "není součástí této nabídky": ["not included in this offer","nicht Bestandteil dieses Angebots","non compris dans la présente offre"],
  "1 varianta": ["1 alternative","1 Variante","1 variante"],
  "měsíc": ["month","Monat","mois"],
  "měsíce": ["months","Monate","mois"],
  "dní": ["days","Tage","jours"],
  /* názvy sekcí Kalkulace PROJ (rekapitulace nabídky) */
  "ZAMĚŘENÍ": ["SURVEY","AUFMASS","RELEVÉ"],
  "ST – STUDIE": ["ST – FEASIBILITY STUDY","ST – STUDIE","ST – ÉTUDE"],
  "PROJEDNÁNÍ STUDIE": ["APPROVAL OF THE STUDY","ABSTIMMUNG DER STUDIE","INSTRUCTION DE L'ÉTUDE"],
  "DPZ – DOKUMENTACE PRO POVOLENÍ ZÁMĚRU": ["DPZ – DOCUMENTATION FOR THE PROJECT PERMIT","DPZ – UNTERLAGEN FÜR DIE VORHABENGENEHMIGUNG","DPZ – DOSSIER DE DEMANDE D'AUTORISATION"],
  "IČ – INŽENÝRSKÁ ČINNOST": ["IČ – ENGINEERING SERVICES","IČ – INGENIEURLEISTUNGEN","IČ – ASSISTANCE ADMINISTRATIVE"],
  "DPS – DOKUMENTACE PRO PROVEDENÍ STAVBY": ["DPS – DETAILED DESIGN DOCUMENTATION","DPS – AUSFÜHRUNGSPLANUNG","DPS – DOSSIER D'EXÉCUTION"],
  /* popisy u cenových řádků (krátké obchodní věty – překládají se) */
  "Cena ZAMĚŘENÍ zamýšleného prostoru pro umístění výtahu, stavebně technický průzkum a zpracování výstupů.": ["Price for the SURVEY of the space intended for the lift, the building-technical inspection and processing of its outputs.","Preis für das AUFMASS des für den Aufzug vorgesehenen Raums, die bautechnische Untersuchung und die Auswertung der Ergebnisse.","Prix du RELEVÉ de l'espace destiné à l'ascenseur, de l'étude technique du bâtiment et du traitement des résultats."],
  "Projednání STUDIE PROVEDITELNOSTI na odboru památkové péče HMP": ["Approval of the FEASIBILITY STUDY at the Prague heritage preservation department","Abstimmung der MACHBARKEITSSTUDIE beim Denkmalschutzamt der Hauptstadt Prag","Instruction de l'ÉTUDE DE FAISABILITÉ auprès du service du patrimoine de la Ville de Prague"],
  "Vypracování každé jedné další varianty řešení požadované Odborem památkové péče": ["Preparation of each further design alternative required by the heritage preservation department","Ausarbeitung jeder weiteren vom Denkmalschutzamt geforderten Lösungsvariante","Élaboration de chaque variante supplémentaire demandée par le service du patrimoine"],
  "Zpracování projektu pro DPZ, včetně PBŘ, STATIKY a ELEKTRO PROJEKTU": ["Preparation of the DPZ design, including fire safety, structural and electrical design","Erstellung der DPZ-Planung einschließlich Brandschutz-, Statik- und Elektroplanung","Établissement du dossier DPZ, y compris sécurité incendie, structure et électricité"],
  "Zpracování podle částí 1–3": ["Prepared according to parts 1–3","Bearbeitung gemäß Teilen 1–3","Traitement selon les parties 1–3"],
  "Sazbu je možné určit i celkovou částkou za určité období, hradí se měsíčně. Obsahuje maximálně 30 hodin výkonu AD za měsíc.": ["The rate may also be agreed as a lump sum for a given period, invoiced monthly. It covers a maximum of 30 hours of site supervision per month.","Der Satz kann auch als Pauschale für einen bestimmten Zeitraum vereinbart und monatlich abgerechnet werden. Er umfasst maximal 30 Stunden Objektüberwachung pro Monat.","Le tarif peut également être convenu au forfait pour une période donnée, facturé mensuellement. Il couvre au maximum 30 heures de suivi par mois."],
};

/* ---- normalizace klíče (tolerance k mezerám, diakritickým uvozovkám,
 *      koncové dvojtečce/hvězdičce a velikosti písmen) ---- */
function prekladNorm(s) {
  return String(s == null ? '' : s)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u201e\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:.*]+$/, '')
    .toLowerCase();
}

/* rejstřík normalizovaný klíč → [EN, DE, FR] (staví se jednou při načtení) */
const PREKLAD_IDX = {};
Object.keys(PREKLAD).forEach(k => { PREKLAD_IDX[prekladNorm(k)] = PREKLAD[k]; });

/* ---- vzory pro řetězce s čísly, které se generují za běhu ----
 * (rozměry, rozteče, počty – slovník je pokrýt nemůže) */
const PREKLAD_VZORY = [
  { re: /^jekl\s+(\d+x\d+)$/i, en: 'SHS $1', de: 'Hohlprofil $1', fr: 'profilé creux $1' },
  { re: /^cca\s+(.+)$/i, en: 'approx. $1', de: 'ca. $1', fr: 'env. $1' },
  { re: /^šířka\s+(.+?)\s+×\s+hloubka\s+(.+)$/i,
    en: 'width $1 × depth $2', de: 'Breite $1 × Tiefe $2', fr: 'largeur $1 × profondeur $2' },
  { re: /^(\d+)x\s+sloupek,\s+ocelové uzavřené profily$/i,
    en: '$1× column, steel hollow sections', de: '$1× Stütze, Stahlhohlprofile',
    fr: '$1× poteau, profilés creux en acier' },
  { re: /^(\d+)\s*ks závěsných ok pro výškové práce$/i,
    en: '$1 pcs of anchor eyes for work at height',
    de: '$1 Stk. Anschlagösen für Höhenarbeiten',
    fr: '$1 pcs d\u2019anneaux d\u2019ancrage pour travaux en hauteur' },
];

/* řetězce, které se nepřekládají (čísla, prázdné pomlčky, kódy RAL apod.) */
function prekladNeutral(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t || t === '-' || t === '–') return true;
  if (/^[\d\s.,/x×+\-]+$/i.test(t) || /^RAL\s*\d+$/i.test(t)) return true;
  /* Evidenční čísla a kódy typu „2026 - OPR - CN - 001“ nebo „DPS/2026/14“.
   * Jsou to identifikátory, ne text – překládat se nesmějí a nemá smysl je
   * hlásit jako chybějící heslo. Podmínky schválně úzké:
   *   – musí obsahovat číslici,
   *   – jen ASCII velká písmena, číslice a oddělovače (žádná diakritika,
   *     takže české nadpisy jako „DODAVATEL“ ani „B. OBCHODNÍ ČÁST“ neprojdou),
   *   – žádné písmenné slovo delší než 4 znaky (slova = text, ne kód). */
  if (/\d/.test(t) && /^[A-Z0-9][A-Z0-9\s.,:;/\\_+\-]*$/.test(t)
    && !/[A-Z]{5,}/.test(t)) return true;
  return false;
}

/* evidence chybějících hesel – podklad pro překladatele i pro report */
const PREKLAD_CHYBI = {};
function prekladZaznamChybi(cz, lang) {
  const k = lang + '\u0000' + cz;
  PREKLAD_CHYBI[k] = { jazyk: lang, cz: cz, pocet: (PREKLAD_CHYBI[k] ? PREKLAD_CHYBI[k].pocet : 0) + 1 };
}

/* ---- hlavní překladová funkce ----
 * tr('UMÍSTĚNÍ ŠACHTY', 'en') → 'SHAFT LOCATION'
 * Není-li překlad, vrací český originál (nikdy prázdno). */
function tr(cz, lang) {
  return trStav(cz, lang).text;
}

/* podrobná varianta: { text, prelozeno, zdroj } */
function trStav(cz, lang) {
  const orig = String(cz == null ? '' : cz);
  if (!lang || lang === 'cz') return { text: orig, prelozeno: true, zdroj: 'cz' };
  const i = JAZYK_IDX[lang];
  if (i === undefined) return { text: orig, prelozeno: true, zdroj: 'cz' };
  if (prekladNeutral(orig)) return { text: orig, prelozeno: true, zdroj: 'neutrální' };

  const hit = PREKLAD_IDX[prekladNorm(orig)];
  if (hit && hit[i]) return { text: hit[i], prelozeno: true, zdroj: 'slovník' };

  for (const v of PREKLAD_VZORY) {
    const m = orig.trim().match(v.re);
    if (m && v[lang]) return { text: orig.trim().replace(v.re, v[lang]), prelozeno: true, zdroj: 'vzor' };
  }

  prekladZaznamChybi(orig, lang);
  return { text: orig, prelozeno: false, zdroj: 'nepřeloženo' };
}

/* ---- údržba slovníku (admin) ---- */
function prekladNastav(cz, lang, text) {
  const i = JAZYK_IDX[lang];
  if (i === undefined) return false;
  if (!PREKLAD[cz]) PREKLAD[cz] = ['', '', ''];
  PREKLAD[cz][i] = String(text == null ? '' : text);
  PREKLAD_IDX[prekladNorm(cz)] = PREKLAD[cz];
  return true;
}
function prekladSmaz(cz) {
  if (!PREKLAD[cz]) return false;
  delete PREKLAD[cz];
  delete PREKLAD_IDX[prekladNorm(cz)];
  return true;
}
function prekladPocet(lang) {
  const i = JAZYK_IDX[lang];
  const ks = Object.keys(PREKLAD);
  if (i === undefined) return ks.length;
  return ks.filter(k => PREKLAD[k][i]).length;
}

/* ---- pokrytí: kolik z předaných řetězců umíme přeložit ---- */
function prekladPokryti(seznam, lang) {
  const uniq = [];
  const videno = {};
  (seznam || []).forEach(s => {
    const t = String(s == null ? '' : s).trim();
    if (!t || prekladNeutral(t)) return;
    const n = prekladNorm(t);
    if (videno[n]) return;
    videno[n] = 1; uniq.push(t);
  });
  const chybi = [];
  let ok = 0;
  uniq.forEach(t => { if (trStav(t, lang).prelozeno) ok++; else chybi.push(t); });
  return { celkem: uniq.length, prelozeno: ok, chybi: chybi,
    procenta: uniq.length ? Math.round(ok / uniq.length * 100) : 100 };
}

/* ---- export/import pro konfigurace.json (SET-2 / N3) ---- */
function prekladExport() {
  const out = {};
  Object.keys(PREKLAD).forEach(k => { out[k] = PREKLAD[k].slice(); });
  return { verze: 1, jazyky: JAZYKY.map(j => j.kod), hesla: out };
}
function prekladImport(data) {
  if (!data || !data.hesla) return 0;
  let n = 0;
  Object.keys(data.hesla).forEach(k => {
    const v = data.hesla[k];
    if (!Array.isArray(v)) return;
    PREKLAD[k] = [v[0] || '', v[1] || '', v[2] || ''];
    PREKLAD_IDX[prekladNorm(k)] = PREKLAD[k];
    n++;
  });
  return n;
}

if (typeof module !== 'undefined')
  module.exports = { JAZYKY, JAZYK_IDX, PREKLAD, PREKLAD_IDX, PREKLAD_VZORY, PREKLAD_CHYBI,
    tr, trStav, prekladNorm, prekladNeutral, prekladNastav, prekladSmaz, prekladPocet,
    prekladPokryti, prekladExport, prekladImport };
