# CLAUDE.md

Erzeugt aus den Angaben des THW-Ausweises eine Karte für Apple Wallet und Google
Wallet. Die Seite in `web/` (Vite, TypeScript ohne Framework) ist nur die Maske
dafür, keine App: keine Ausweisansicht, kein Start ohne Netz. Ein kleiner
Node-Dienst in `server/` liefert sie aus und signiert die Karten. Gestaltung und Aufbau folgen `wattnpapa/einsatzauftrag`,
der Betrieb `wattnpapa/S1-Control` (Docker hinter Plesk).

## Befehle

```bash
npm install
npm test             # Vitest (watch)
npx vitest run
npm run typecheck
npm run web          # Seite im Entwicklungsserver, /wallet geht an 127.0.0.1:8080
npm run build        # Seite → dist-web/, Dienst → dist-dienst/dienst.mjs
npm start            # Dienst starten (Einstellungen aus der Umgebung, .env.beispiel)
```

## Regeln

- Der Dienst speichert nichts: keine Datenbank, keine Datei, keine Inhalte und
  keine Adressen im Protokoll. Im Speicher liegt nur der Zähler der Anfragebremse.
- Die Eingaben liegen im `localStorage` des Browsers (`da.ausweis.v1`,
  `da.foto.v1`), damit man die Karte später neu erstellen kann. Alles, was von
  außen kommt (Speicher, Netz), geht durch `bereinige` in `src/daten.ts`, im
  Browser wie im Dienst.
- `src/` ist gemeinsam für Seite und Dienst und hängt von nichts ab. `src/strichcode.ts`
  rechnet Module, die Seite zeichnet daraus SVG, der Dienst PNG (`server/bild.ts`).
- Der Strichcode der Karten ist Code 128 mit der vollen Nummer samt Bindestrich
  und laufender Endnummer (`01234567-01`); Wallet zeichnet ihn selbst. Code 39
  bleibt wählbar. Den zeichnet Apple Wallet nicht: Foto und Strichcode stehen
  dann gemeinsam im Streifenbild einer Eintrittskarte.
- Die Dienststelle wird in `bereinige` auf die Schreibweise des Verzeichnisses
  gebracht (`src/dienststelle.ts`: „OV Aachen“, „RSt Aachen“, „LV Bayern“;
  Kürzel wie `OAAC` gehen auch). Unbekanntes bleibt freier Text.
  `src/dienststellen.ts` ist erzeugt aus den Vokabularen des Erfassungsbogens
  (`wattnpapa/bos-vokabulare`): `node scripts/dienststellen-uebernehmen.mjs`.
- Neue Berechtigungen kommen in `src/berechtigungen.ts`. Eine vergebene `id`
  ändert sich nie mehr, sonst verlieren gespeicherte Ausweise den Eintrag.
- Der Strichcode steht in jedem Anzeigemodus schwarz auf weiß.
- Kein THW-Zeichen im Repository. Logo (`logo.png`, weiß) und Emblem
  (`emblem.png`, blau) liegen in `marke/` (in .gitignore) und kommen über
  `DA_MARKE` zur Laufzeit in den Dienst, wie die Schlüssel. Ohne sie gibt es
  Karten ohne Logo. Die Karte heißt überall selbst erstellte Kopie und nie amtlich.
- Kennfarbe der Karten ist RAL 5002 Ultramarinblau, digital `#00387b`
  (`KENNFARBE` in `server/bild.ts`).
- Schlüssel und Zertifikate liegen in `geheim/` (in .gitignore), nie im Bild
  und nie im Repository.
- `node-forge` ist die einzige Laufzeit-Abhängigkeit (PKCS#7 für Apple). ZIP und
  PNG schreibt der Dienst selbst.
- Die Seite lädt nichts von fremden Adressen (CSP in `server/dienst.ts`).
- Relative Imports mit `.js`-Endung. Bezeichner und Kommentare deutsch.
- Gestaltung nach dem Design-System von erfassungsbogen.app (`web/src/stil.css`:
  Rollen-Token, Radius 0, Anzeigemodi Standard/Dunkel/Feld/Nacht).
- Commits: Conventional Commits.
