#!/usr/bin/env bash
# ==========================================================================
# SIH26-S02 Grievance System — local development launcher
#
#   ./start.sh          start MongoDB check + AI service + API + client
#   ./start.sh --setup  install dependencies first, then start
#   ./start.sh --no-llm run the AI service on its rule engine only (offline)
#
# For containers use `docker compose up --build` instead.
# ==========================================================================
set -euo pipefail

# Job control gives every background job its own process group, which is what
# makes the `kill -TERM -$pid` in cleanup() reach vite/nodemon grandchildren.
set -m

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$ROOT/sih-ai-service"
SERVER_DIR="$ROOT/sih-web-portal/server"
CLIENT_DIR="$ROOT/sih-web-portal/client"
LOG_DIR="$ROOT/.logs"

DO_SETUP=false
NO_LLM=false
for arg in "$@"; do
  case "$arg" in
    --setup)  DO_SETUP=true ;;
    --no-llm) NO_LLM=true ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }

PIDS=()
cleanup() {
  echo
  blue "Shutting down..."
  # Kill the whole process group of each child: `npm run dev` spawns vite as a
  # grandchild, which would otherwise survive and hold port 5173.
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        # Negative pid targets the whole process group, so vite and nodemon
        # grandchildren die with their parent instead of holding the ports.
        kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      fi
    done
  fi
  wait 2>/dev/null || true
  green "All services stopped."
}
trap cleanup EXIT INT TERM

# --- prerequisites ---------------------------------------------------------
command -v node    >/dev/null || { red "node is required (https://nodejs.org)"; exit 1; }
command -v python3 >/dev/null || { red "python3 is required"; exit 1; }

blue "==> Checking MongoDB on localhost:27017"
if command -v nc >/dev/null && nc -z localhost 27017 2>/dev/null; then
  green "    MongoDB is reachable."
else
  warn "    MongoDB is NOT reachable on localhost:27017."
  warn "    Start one of:"
  warn "      docker run -d -p 27017:27017 --name sih-mongo mongo:7"
  warn "      brew services start mongodb-community"
  warn "    Or set MONGODB_URI in sih-web-portal/server/.env to an Atlas URI."
  warn "    Continuing — the API will retry its connection."
fi

# --- .env bootstrapping ----------------------------------------------------
for pair in "$AI_DIR" "$SERVER_DIR" "$CLIENT_DIR"; do
  if [[ -f "$pair/.env.example" && ! -f "$pair/.env" ]]; then
    cp "$pair/.env.example" "$pair/.env"
    warn "    Created $(basename "$(dirname "$pair")")/$(basename "$pair")/.env from the example — fill in your keys."
  fi
done

# --- setup -----------------------------------------------------------------
if $DO_SETUP; then
  blue "==> Installing Python dependencies (this pulls torch; give it a few minutes)"
  [[ -d "$AI_DIR/.venv" ]] || python3 -m venv "$AI_DIR/.venv"
  "$AI_DIR/.venv/bin/pip" install --quiet --upgrade pip
  # faiss-cpu has no wheel on some Python versions. The service falls back to a
  # NumPy search, so a failure here is not fatal.
  "$AI_DIR/.venv/bin/pip" install --quiet -r "$AI_DIR/requirements.txt" || \
    warn "    Some Python packages failed; the service will use its fallbacks."

  blue "==> Installing Node dependencies"
  (cd "$SERVER_DIR" && npm install --silent)
  (cd "$CLIENT_DIR" && npm install --silent)
  green "    Setup complete."
fi

[[ -d "$AI_DIR/.venv" ]] || { red "No Python venv. Run: ./start.sh --setup"; exit 1; }
[[ -d "$SERVER_DIR/node_modules" ]] || { red "Server deps missing. Run: ./start.sh --setup"; exit 1; }
[[ -d "$CLIENT_DIR/node_modules" ]] || { red "Client deps missing. Run: ./start.sh --setup"; exit 1; }

# --- AI service ------------------------------------------------------------
blue "==> Starting AI service on :8000"
# Exported rather than passed through `env`: an empty array expands to an
# empty argument, and `env ""` fails outright.
if $NO_LLM; then
  export LLM_ENABLED=false
  warn "    LLM disabled — using the deterministic rule engine only."
fi
(
  cd "$AI_DIR"
  ./.venv/bin/uvicorn app.sih_main:app \
    --host 0.0.0.0 --port 8000 > "$LOG_DIR/ai-service.log" 2>&1
) &
PIDS+=($!)

# The embedding model loads at startup, so first boot is slow. Poll rather than
# sleeping a fixed amount.
printf '    waiting for the AI service'
for i in $(seq 1 90); do
  if curl -sf -m 2 http://localhost:8000/health >/dev/null 2>&1; then
    echo; green "    AI service ready."
    break
  fi
  printf '.'
  sleep 1
  if [[ $i -eq 90 ]]; then
    echo; red "    AI service did not come up. See $LOG_DIR/ai-service.log"
    warn "    Continuing — the API degrades gracefully without it."
  fi
done

# --- Express API -----------------------------------------------------------
blue "==> Starting Express API on :3000"
( cd "$SERVER_DIR" && npm run dev > "$LOG_DIR/api.log" 2>&1 ) &
PIDS+=($!)
sleep 3

# --- React client ----------------------------------------------------------
blue "==> Starting React client on :5173"
( cd "$CLIENT_DIR" && npm run dev > "$LOG_DIR/client.log" 2>&1 ) &
PIDS+=($!)
sleep 3

cat <<BANNER

$(green "  SIH26-S02 Grievance System is running")

    Citizen portal    http://localhost:5173
    Express API       http://localhost:3000/api/health
    AI service docs   http://localhost:8000/docs
    AI engine status  http://localhost:8000/ai-health

    Logs              $LOG_DIR/{ai-service,api,client}.log

    Press Ctrl-C to stop everything.

BANNER

wait
