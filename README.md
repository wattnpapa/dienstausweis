# Dienstausweis

Eine Seite, die aus den Angaben des THW-Ausweises eine Karte für Apple Wallet
oder Google Wallet erzeugt. Man trägt Dienstausweisnummer, Name, Vorname,
Geburtstag und Gültigkeit ein, wählt seine Berechtigungen, auf Wunsch ein
Passfoto, und legt die Karte in die Wallet. Der Strichcode darauf ist der der
Karte und dient am Zeiterfassungsterminal.

Die Seite ist bewusst keine App: Sie zeigt keinen Ausweis an und läuft nicht ohne
Netz. Sie ist die Maske, die Wallet ist die Anzeige.

Kein amtliches Angebot des THW. Die Karte ist eine vom Inhaber selbst erstellte
Kopie und ersetzt den THW-Ausweis nicht.

## Wo die Daten liegen

Die Eingaben liegen im `localStorage` des Browsers, damit man die Karte später
mit geänderten Berechtigungen neu erstellen kann. Es gibt kein Konto und keine
Datenbank.

Eine Wallet-Karte braucht eine Signatur mit einem geheimen Schlüssel, bei Apple
das Pass-Type-ID-Zertifikat, bei Google den Schlüssel eines Dienstkontos. Der
darf nicht im Browser liegen. Deshalb gehört zur Seite ein kleiner Dienst
(`server/`): Er nimmt die Angaben entgegen, baut und signiert die Karte im
Arbeitsspeicher, schickt sie zurück und verwirft die Daten. Er schreibt nichts
auf die Platte, der Container läuft mit schreibgeschütztem Dateisystem.

## Strichcode

Die Karten tragen Code 39 mit der vollen Nummer samt Bindestrich und laufender
Endnummer, etwa `01234567-01`. Das ist die Vorgabe. Unter „Strichcode anpassen“
lassen sich Art (Code 39 oder Code 128) und ein abweichender Inhalt setzen.

Apple Wallet zeichnet von den eindimensionalen Codes nur Code 128 selbst. Bei
Code 39 legt der Dienst deshalb ein Streifenbild in die Karte (Passart
`eventTicket`, Streifen 375 × 98 Punkt): links das Foto, daneben der
Strichcode. Darunter stehen zwei Zeilen: Name, Dienststelle, Geburtsdatum und
Gültigkeit, dann die Berechtigungen. Die Kundenkarte (`storeCard`) hätte nur
eine Zeile für alles. Ob das Terminal den Strichcode vom Bildschirm liest, ist
am Gerät zu prüfen. Google Wallet zeichnet Code 39 selbst, nimmt aber keine Fotos an, weil
Bilder dort unter einer öffentlichen Adresse liegen müssten.

## Berechtigungen

Der Katalog steht in `src/berechtigungen.ts`: Fahrerlaubnisklassen,
Fahrberechtigungen, Atemschutzgeräteträger und weitere. Ein neuer Eintrag dort
erscheint in der Maske und auf den Karten. Befristete Einträge fragen nach einem
Ablaufdatum. Was im Katalog
fehlt, trägt man als eigene Berechtigung frei ein.

## Entwickeln

```bash
npm install
npm run web          # Seite unter http://localhost:5173
npx vitest run       # Tests
npm run build        # dist-web/ und dist-dienst/dienst.mjs
DA_PORT=8080 npm start
```

Ohne Apple- und Google-Angaben läuft der Dienst trotzdem und liefert die Seite
aus; sie meldet dann, dass der Server keine Karten ausstellt.

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

Logo und Emblem liegen nicht im Repository. Für Karten mit Logo aus dem
CD-Paket des THW (`Digital_RGB/PNG_Raster`, 1000 px) das weiße Logo als
`marke/logo.png` und das blaue Emblem als `marke/emblem.png` ablegen und
`DA_MARKE=/marke` in `.env` setzen. Apple Wallet zeigt dann das Logo oben links
und das Emblem als Symbol, Google Wallet das Emblem (von `/marke/emblem.png`).

Danach in Plesk die Domain anlegen, Let's Encrypt einschalten und den Inhalt von
`deploy/plesk/nginx-direktiven.conf` unter „Additional nginx directives“
eintragen. Ist nginx in Plesk aus (wie auf srv01), stattdessen
`deploy/plesk/apache-direktiven.conf` unter „Additional directives for HTTPS“. Der Workflow `deploy-plesk.yml` aktualisiert den Server bei jedem Push
auf `main`, sobald die Secrets `PLESK_HOST`, `PLESK_USER`, `PLESK_SSH_KEY`,
`PLESK_KNOWN_HOSTS` gesetzt sind und die Repository-Variable `PLESK_DEPLOY` auf
`an` steht.

Die Seite lässt sich auch getrennt hosten, etwa auf GitHub Pages: mit
`VITE_WALLET_DIENST=https://<Server>/wallet npm run web:build` bauen und die
Adresse der Seite beim Dienst in `DA_URSPRUENGE` eintragen.

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
4. `DA_ADRESSE` auf die Adresse der Seite setzen.

Die Karte steckt vollständig im Speichern-Link. Deshalb stehen Berechtigungen
bei Google als Kurzzeichen.

## Lizenz

EUPL-1.2
