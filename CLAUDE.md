# CLAUDE.md

Digitale Kopie des THW-Dienstausweises: Web-App in `web/` (Vite, TypeScript ohne
Framework), dazu ein kleiner Node-Dienst in `server/`, der die App ausliefert und
Wallet-Pässe signiert. Gestaltung und Aufbau folgen `wattnpapa/einsatzauftrag`,
der Betrieb `wattnpapa/S1-Control` (Docker hinter Plesk).

## Befehle

```bash
npm install
npm test             # Vitest (watch)
npx vitest run
npm run typecheck
npm run web          # App im Entwicklungsserver, /wallet geht an 127.0.0.1:8080
npm run build        # App → dist-web/, Dienst → dist-dienst/dienst.mjs
npm start            # Dienst starten (Einstellungen aus der Umgebung, .env.beispiel)
```

## Regeln

- Der Dienst speichert nichts: keine Datenbank, keine Datei, keine Inhalte und
  keine Adressen im Protokoll. Im Speicher liegt nur der Zähler der Anfragebremse.
- Ausweis und Foto liegen im `localStorage` des Browsers (`da.ausweis.v1`,
  `da.foto.v1`). Alles, was von außen kommt (Speicher, Sicherungsdatei, Netz),
  geht durch `bereinige` in `src/daten.ts`, im Browser wie im Dienst.
- `src/` ist gemeinsam für App und Dienst und hängt von nichts ab. `src/strichcode.ts`
  rechnet Module, die App zeichnet daraus SVG, der Dienst PNG (`server/bild.ts`).
- Neue Berechtigungen kommen in `src/berechtigungen.ts`. Eine vergebene `id`
  ändert sich nie mehr, sonst verlieren gespeicherte Ausweise den Eintrag.
- Der Strichcode steht in jedem Anzeigemodus schwarz auf weiß.
- Kein THW-Zeichen im Repository. Die App nennt sich überall „digitale Kopie“
  und nie amtlich.
- Schlüssel und Zertifikate liegen in `geheim/` (in .gitignore), nie im Bild
  und nie im Repository.
- `node-forge` ist die einzige Laufzeit-Abhängigkeit (PKCS#7 für Apple). ZIP und
  PNG schreibt der Dienst selbst.
- Die App lädt nichts von fremden Adressen (CSP in `server/dienst.ts`).
- Relative Imports mit `.js`-Endung. Bezeichner und Kommentare deutsch.
- Gestaltung nach dem Design-System von erfassungsbogen.app (`web/src/stil.css`:
  Rollen-Token, Radius 0, Anzeigemodi Standard/Dunkel/Feld/Nacht).
- Commits: Conventional Commits.
