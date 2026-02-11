# ZPL Logistics Roadmap

## Must-have

1. `^GF` + `~DG` + `^XG`
- Obrazy/logo i elementy przewoznikow; bez tego etykiety czesto roznia sie od produkcji.

2. `^PW`, `^LL`, `^LH`, `^LT`, `^LS`, `^PO`
- Pelna geometria etykiety i orientacja, krytyczne dla zgodnosci preview vs wydruk.

3. `^FB` + lepsze wsparcie fontow (`^A@`)
- Poprawne lamanie adresow i sekcji tekstowych.

4. GS1/data binding: `^FN`, `^FV`, `^SN`
- Dynamiczne szablony i seryjna numeracja.

5. Dodatkowe barkody: `^B7` (PDF417) i `^BD` (MaxiCode)
- Wymagane w wielu scenariuszach transportowych.

## Should-have

1. Lepsza diagnostyka parsera
- Lista nieobslugiwanych komend, linia i potencjalny impact.

2. Profile drukarek (203/300/600 dpi + model)
- Lepsza zgodnosc miedzy podgladem a realnym urzadzeniem.

3. Clipping/overflow + strefy niedrukowalne
- Wykrywanie elementow poza obszarem wydruku.

## Nice-to-have

1. Symulacja parametrow print engine (`^MD`, `^PR`)
- Wizualna kalibracja pod konkretna drukarke.

2. Eksport porownawczy (preview vs referencyjny PNG)
- Prostszy QA i testy regresji.

## Suggested Sprint Order

1. Sprint 1
- `^GF`/`~DG`/`^XG`
- `^PW`/`^LL`/`^LH`/`^LT`/`^LS`/`^PO`

2. Sprint 2
- `^FB` + `^A@`
- `^FN`/`^FV`/`^SN`
- `^B7` + `^BD`

3. Sprint 3
- Diagnostyka i profile drukarek
- Clipping i strefy niedrukowalne
- Narzedzia porownawcze QA
