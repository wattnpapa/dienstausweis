# Dienstausweis

Web-App für eine digitale Kopie des THW-Dienstausweises. Man trägt
Dienstausweisnummer, Name, Dienststelle, Geburtsdatum und Gültigkeit ein, wählt
seine Berechtigungen und bekommt den Ausweis mit Strichcode aufs Telefon, zum
Vorhalten am Zeiterfassungsterminal. Auf Wunsch wandert er als Pass in Apple
Wallet oder Google Wallet.

Kein amtliches Angebot des THW. Was die App zeigt, ist eine vom Inhaber selbst
erstellte Kopie und ersetzt den Dienstausweis nicht.

## Wo die Daten liegen

Ausweis und Foto liegen im `localStorage` des Browsers, sonst nirgends. Es gibt
kein Konto und keine Datenbank. Nach dem ersten Aufruf startet die App auch ohne
Netz (Service Worker), der Strichcode funktioniert also im Keller der Unterkunft.

Ein Wallet-Pass braucht eine Signatur mit einem geheimen Schlüssel, bei Apple das
Pass-Type-ID-Zertifikat, bei Google den Schlüssel eines Dienstkontos. Der darf
nicht im Browser liegen. Deshalb gehört zur App ein kleiner Dienst
(`server/`): Er nimmt die Ausweisdaten entgegen, baut und signiert den Pass im
Arbeitsspeicher, schickt ihn zurück und verwirft die Daten. Er schreibt nichts
auf die Platte, der Container läuft mit schreibgeschütztem Dateisystem.

## Strichcode

Der Strichcode trägt die Dienstausweisnummer, als Code 39 (Vorgabe) oder Code 128.
Unter „Daten eintragen“ → „Strichcode“ lässt sich die Art umstellen und ein
abweichender Inhalt setzen, falls die Karte etwas anderes kodiert als die
aufgedruckte Nummer. Welche Art und welchen Inhalt die echten Karten tragen, ist
noch gegen eine Karte zu prüfen; danach wird die Vorgabe in `src/daten.ts`
(`LEER.strichcodeArt`) festgelegt.

Apple Wallet zeichnet von den eindimensionalen Codes nur Code 128 selbst. Bei
Code 39 legt der Dienst den Strichcode als Bild in den Pass (Passart
`storeCard`), dort ist dann kein Platz für das Foto. Google Wallet kennt beide.

## Berechtigungen

Der Katalog steht in `src/berechtigungen.ts`: Fahrerlaubnisklassen,
Fahrberechtigungen, Atemschutzgeräteträger und weitere. Ein neuer Eintrag dort
erscheint in Maske, Ausweis und Pässen. Befristete Einträge fragen nach einem
Ablaufdatum, abgelaufene sind auf dem Ausweis durchgestrichen. Was im Katalog
fehlt, trägt man als eigene Berechtigung frei ein.

## Entwickeln

```bash
npm install
npm run web          # App unter http://localhost:5173
npx vitest run       # Tests
npm run build        # dist-web/ und dist-dienst/dienst.mjs
DA_PORT=8080 npm start
```

Ohne Apple- und Google-Angaben läuft der Dienst trotzdem und liefert die App aus;
die Wallet-Knöpfe bleiben dann verborgen.

Die Tests prüfen die Strichcodes gegen JsBarcode, die Signatur des Apple-Passes
mit OpenSSL gegen ein selbst ausgestelltes Zertifikat und die Signatur des
Google-Links. Ob Apple und Google die Pässe annehmen, zeigt erst ein echtes
Konto; das ist noch nicht geschehen.

## Betrieb auf dem Plesk-Server

Wie bei S1-Control: Docker-Container auf dem Loopback, davor der nginx von Plesk.

```bash
git clone https://github.com/wattnpapa/dienstausweis.git /opt/dienstausweis
bash /opt/dienstausweis/deploy/plesk/deploy.sh   # legt .env an und hält an
# .env ausfüllen, Zertifikate nach /opt/dienstausweis/geheim/ legen
bash /opt/dienstausweis/deploy/plesk/deploy.sh
```

Danach in Plesk die Domain anlegen, Let's Encrypt einschalten und den Inhalt von
`deploy/plesk/nginx-direktiven.conf` unter „Additional nginx directives“
eintragen. Der Workflow `deploy-plesk.yml` aktualisiert den Server bei jedem Push
auf `main`, sobald die Secrets `PLESK_HOST`, `PLESK_USER`, `PLESK_SSH_KEY`,
`PLESK_KNOWN_HOSTS` gesetzt sind und die Repository-Variable `PLESK_DEPLOY` auf
`an` steht.

Die App lässt sich auch getrennt hosten, etwa auf GitHub Pages: mit
`VITE_WALLET_DIENST=https://<Server>/wallet npm run web:build` bauen und die
Adresse der App beim Dienst in `DA_URSPRUENGE` eintragen.

### Apple Wallet einrichten

Voraussetzung ist ein Apple-Developer-Konto.

1. Unter Certificates, Identifiers & Profiles eine Pass Type ID anlegen, z. B.
   `pass.app.dienstausweis`, und dafür ein Zertifikat ausstellen.
2. Zertifikat und Schlüssel als PEM nach `geheim/` legen:
   `openssl x509 -inform DER -in pass.cer -out geheim/pass.pem`, den privaten
   Schlüssel aus der Zertifikatsanfrage als `geheim/pass.key`.
3. Das Zwischenzertifikat „Worldwide Developer Relations – G4“ von Apple laden
   und als `geheim/wwdr.pem` ablegen
   (`openssl x509 -inform DER -in AppleWWDRCAG4.cer -out geheim/wwdr.pem`).
4. In `.env` `DA_APPLE_PASS_TYP` und `DA_APPLE_TEAM` (Team ID) eintragen.

### Google Wallet einrichten

1. In der Google Pay & Wallet Console ein Aussteller-Konto anlegen und die
   Google Wallet API freischalten lassen. Die Issuer ID kommt nach
   `DA_GOOGLE_AUSSTELLER`.
2. Dort eine Klasse vom Typ „Generic“ anlegen; ihre Kennung ohne Issuer ID kommt
   nach `DA_GOOGLE_KLASSE` (Vorgabe `dienstausweis`).
3. In der Google Cloud Console ein Dienstkonto anlegen, in der Wallet Console
   als Nutzer eintragen und seine Schlüsseldatei als
   `geheim/google-dienstkonto.json` ablegen.
4. `DA_ADRESSE` auf die Adresse der App setzen.

Der Pass steckt vollständig im Speichern-Link. Deshalb fehlt bei Google das Foto
(Google nimmt Bilder nur von öffentlichen Adressen), und Berechtigungen stehen
dort als Kurzzeichen.

## Lizenz

EUPL-1.2
