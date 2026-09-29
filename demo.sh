#!/usr/bin/env bash
# ==========================================================================
# SIH26-S02 — one-command demo, no Docker and no MongoDB install required.
#
#   ./demo.sh              start everything and seed sample grievances
#   ./demo.sh --no-seed    start everything, leave the database empty
#
# Runs an in-memory MongoDB, the FastAPI AI service, the Express API and the
# React client, and seeds sign-in-able demo accounts. No third-party services
# and no API keys are required.
# ==========================================================================
set -euo pipefail
set -m

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$ROOT/sih-ai-service"
SERVER_DIR="$ROOT/sih-web-portal/server"
CLIENT_DIR="$ROOT/sih-web-portal/client"
DEMO_DIR="$ROOT/.demo"
LOG_DIR="$ROOT/.logs"

SEED=true
[[ "${1:-}" == "--no-seed" ]] && SEED=false

mkdir -p "$LOG_DIR" "$DEMO_DIR"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

PIDS=()
cleanup() {
  echo; blue "Shutting down..."
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    for pid in "${PIDS[@]}"; do
      kill -0 "$pid" 2>/dev/null && { kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; }
    done
  fi
  wait 2>/dev/null || true
  green "Stopped."
}
trap cleanup EXIT INT TERM

wait_for() {  # wait_for <label> <url> <seconds>
  printf '    %s' "$1"
  for _ in $(seq 1 "$3"); do
    curl -sf -m 2 "$2" >/dev/null 2>&1 && { echo " ready"; return 0; }
    printf '.'; sleep 1
  done
  echo " TIMED OUT"; return 1
}

# --- dependency checks -----------------------------------------------------
[[ -d "$AI_DIR/.venv" ]]               || { red "Missing Python venv. Run: ./start.sh --setup"; exit 1; }
[[ -d "$SERVER_DIR/node_modules" ]]    || { red "Missing server deps. Run: cd sih-web-portal/server && npm install"; exit 1; }
[[ -d "$CLIENT_DIR/node_modules" ]]    || { red "Missing client deps. Run: cd sih-web-portal/client && npm install"; exit 1; }

# --- in-memory MongoDB -----------------------------------------------------
if [[ ! -d "$DEMO_DIR/node_modules/mongodb-memory-server" ]]; then
  blue "==> Installing the demo MongoDB (one time, downloads a mongod binary)"
  # npm derives a package name from the working-directory name. `.demo` is
  # not a valid package name, so `npm init -y` fails before it can install the
  # runtime. `--prefix` installs the demo-only dependency without creating a
  # package manifest for the hidden directory.
  npm install --prefix "$DEMO_DIR" mongodb-memory-server --no-audit --no-fund >/dev/null 2>&1
fi

cat > "$DEMO_DIR/run-mongo.mjs" <<'JSEOF'
import { MongoMemoryServer } from 'mongodb-memory-server';
const mongo = await MongoMemoryServer.create({ instance: { port: 27017, dbName: 'citizencare' } });
console.log('MongoDB ready at ' + mongo.getUri());
const stop = async () => { await mongo.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
JSEOF

blue "==> Starting MongoDB (in-memory) on :27017"
( cd "$DEMO_DIR" && node run-mongo.mjs > "$LOG_DIR/mongo.log" 2>&1 ) &
PIDS+=($!)
printf '    mongodb'
for _ in $(seq 1 90); do
  (command -v nc >/dev/null && nc -z localhost 27017 2>/dev/null) && { echo " ready"; break; }
  printf '.'; sleep 1
done

# --- .env files ------------------------------------------------------------
# Placeholder Clerk credentials: enough for the app to boot and for the public
# pages to work. Sign-in genuinely requires real keys.
if [[ ! -f "$CLIENT_DIR/.env" ]]; then
  cat > "$CLIENT_DIR/.env" <<'EOF'
VITE_API_URL=http://localhost:3000/api
VITE_AI_SERVICE_URL=http://localhost:8000
EOF
fi
if [[ ! -f "$SERVER_DIR/.env" ]]; then
  cat > "$SERVER_DIR/.env" <<'EOF'
PORT=3000
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/citizencare
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT_MS=12000
JWT_SECRET=dev-secret-change-me-in-production-0123456789
JWT_EXPIRES_IN=7d
ADMIN_EMAILS=admin@demo.in
EOF
  warn "    Wrote server/.env with a development JWT secret — replace it before deploying."
fi

# --- AI service ------------------------------------------------------------
blue "==> Starting the AI service on :8000"
( cd "$AI_DIR" && ./.venv/bin/uvicorn app.sih_main:app --host 0.0.0.0 --port 8000 \
    > "$LOG_DIR/ai-service.log" 2>&1 ) &
PIDS+=($!)
wait_for "ai-service" http://localhost:8000/health 90 || warn "    See $LOG_DIR/ai-service.log"

# --- API -------------------------------------------------------------------
blue "==> Starting the Express API on :3000"
( cd "$SERVER_DIR" && node server.js > "$LOG_DIR/api.log" 2>&1 ) &
PIDS+=($!)
wait_for "api" http://localhost:3000/api/health 40 || warn "    See $LOG_DIR/api.log"

# --- seed ------------------------------------------------------------------
if $SEED; then
  blue "==> Seeding grievances through the real AI pipeline"
  ( cd "$SERVER_DIR" && node seedDemo.js --reset 2>&1 | grep -v dotenv | sed 's/^/    /' ) || \
    warn "    Seeding failed; the UI will just be empty."
fi

# --- client ----------------------------------------------------------------
blue "==> Starting the React client on :5173"
( cd "$CLIENT_DIR" && npm run dev -- --port 5173 --strictPort > "$LOG_DIR/client.log" 2>&1 ) &
PIDS+=($!)
wait_for "client" http://localhost:5173 40 || warn "    See $LOG_DIR/client.log"

cat <<BANNER

$(green "  Running. Open these:")

    Portal            http://localhost:5173
    AI service docs   http://localhost:8000/docs     <- try /analyze-complaint
    AI engine status  http://localhost:8000/ai-health

  $(green "Seeded accounts (password: demo12345):")

    Citizens              /sign-in
      citizen@demo.in     file and track grievances
      meena@demo.in

    Officials             /official/sign-in
      officer@gov.in      Public Works Department · Karnataka
      pwd.officer@gov.in  Public Works Department · Karnataka

    Owner                 /sign-in
      admin@demo.in       owner console, dashboards, user management

  Registering at /sign-up walks the Aadhaar verification step
  (simulated - the code is shown on screen outside production).

  $(warn "The in-memory database is wiped when you stop this script.")

    Logs   $LOG_DIR/

    Ctrl-C to stop everything.

BANNER

wait
