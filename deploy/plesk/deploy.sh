#!/usr/bin/env bash
# Dienstausweis auf einem Plesk-Server einrichten oder
# aktualisieren (docker-compose.plesk.yml).
#
# Aufruf auf dem Server als root:
#
#   bash deploy/plesk/deploy.sh                 # aus einem Checkout heraus
#   DA_ZWEIG=ein-zweig bash deploy.sh         # anderer Zweig
#
# Was das Skript tut, in dieser Reihenfolge:
#   1. Quelle nach $DA_ZIEL holen oder aktualisieren (git).
#   2. .env anlegen, falls sie fehlt — und dann anhalten, bis sie ausgefuellt ist.
#   3. Bild bauen und Dienst starten (docker compose -f docker-compose.plesk.yml).
#   4. /gesundheit auf dem Loopback pruefen und das Protokoll zeigen.
#
# Was es NICHT tut: die Domain in Plesk anlegen, das Zertifikat holen, die
# nginx-Direktiven eintragen, Zertifikate nach geheim/ legen. Siehe README.
set -euo pipefail

DA_ZIEL="${DA_ZIEL:-/opt/dienstausweis}"
DA_QUELLE="${DA_QUELLE:-https://github.com/wattnpapa/dienstausweis.git}"
DA_ZWEIG="${DA_ZWEIG:-main}"
COMPOSE="docker compose -f docker-compose.plesk.yml"

fehlt() { echo "FEHLT: $1" >&2; exit 1; }
command -v git >/dev/null || fehlt "git"
command -v docker >/dev/null || fehlt "docker (Plesk: Erweiterung „Docker“ oder docker-ce installieren)"
docker compose version >/dev/null 2>&1 || fehlt "docker compose (Plugin v2)"

# 1. Quelle
if [ -d "$DA_ZIEL/.git" ]; then
  echo "Aktualisiere $DA_ZIEL ($DA_ZWEIG)"
  git -C "$DA_ZIEL" fetch --prune origin
  git -C "$DA_ZIEL" checkout -q "$DA_ZWEIG"
  git -C "$DA_ZIEL" pull --ff-only origin "$DA_ZWEIG"
else
  echo "Hole $DA_QUELLE ($DA_ZWEIG) nach $DA_ZIEL"
  git clone --branch "$DA_ZWEIG" "$DA_QUELLE" "$DA_ZIEL"
fi
cd "$DA_ZIEL"

# 2. Zugangsdaten
if [ ! -f .env ]; then
  cp .env.beispiel .env
  chmod 600 .env
  echo
  echo "Neu angelegt: $DA_ZIEL/.env"
  echo "Bitte DA_ADRESSE und, für die Wallets, die Apple- und Google-Angaben eintragen,"
  echo "Zertifikate nach $DA_ZIEL/geheim legen und das Skript erneut starten."
  exit 2
fi
chmod 600 .env
# shellcheck disable=SC1091
set -a; . ./.env; set +a
# Der Dienst läuft im Container als Benutzer node (1000) und darf die Schlüssel nur lesen.
mkdir -p geheim
chown -R root:1000 geheim
chmod 750 geheim
find geheim -type f -exec chmod 640 {} +
PORT="${DA_PLESK_PORT:-8086}"

# 3. Bauen und starten
echo "Baue und starte den Dienst (Port 127.0.0.1:$PORT)"
$COMPOSE up -d --build --remove-orphans

# 4. Pruefen
echo -n "Warte auf /gesundheit "
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/gesundheit" >/dev/null 2>&1; then echo "— ok"; break; fi
  echo -n "."; sleep 2
done
curl -fsS "http://127.0.0.1:$PORT/gesundheit" >/dev/null || { echo; $COMPOSE logs --tail 50 dienstausweis; fehlt "Dienst antwortet nicht"; }
$COMPOSE logs --tail 5 dienstausweis | grep -E "Wallet|lauscht" || true
echo
echo "Fertig. Jetzt in Plesk (einmalig):"
echo "  1. Domain anlegen, SSL It! → Let's Encrypt, Umleitung http → https."
echo "  2. Apache & nginx Settings → Additional nginx directives:"
echo "     Inhalt von $DA_ZIEL/deploy/plesk/nginx-direktiven.conf (Port $PORT)."
echo "  3. https://<Domain> öffnen."
