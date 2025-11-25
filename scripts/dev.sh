#!/bin/sh

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# Helper for colored output
log() {
  printf "%b\n" "$1"
}

# Check for required tools
if ! command -v docker-compose >/dev/null 2>&1; then
  log "${RED}${BOLD}[dev.sh] Error: docker-compose is not installed!${RESET}"
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  log "${RED}${BOLD}[dev.sh] Error: Bun is not installed!${RESET}"
  exit 1
fi

# 1. Generate .env if missing
if [ ! -f .env ]; then
  log "${YELLOW}[dev.sh] .env not found, generating with setup-env.js...${RESET}"
  bun run scripts/setup-env.js
else
  log "${GREEN}[dev.sh] .env already exists.${RESET}"
fi

# 2. Build Docker images (if needed)
log "${BLUE}[dev.sh] Building Docker images...${RESET}"
docker-compose build || { log "${RED}[dev.sh] Docker build failed!${RESET}"; exit 1; }

# 3. Start all services
log "${BLUE}[dev.sh] Starting all services with Docker Compose...${RESET}"
docker-compose up -d || { log "${RED}[dev.sh] Docker Compose failed to start!${RESET}"; exit 1; }

log "${GREEN}[dev.sh] All services are starting. Use 'docker-compose logs -f' to view logs.${RESET}"

# 4. Show container status
echo
log "${BOLD}Container status:${RESET}"
docker-compose ps

echo
log "${BOLD}Endpoints:${RESET}"
log "  ${GREEN}API:${RESET}      http://localhost:3000"
log "  ${GREEN}Swagger:${RESET}  http://localhost:3000/swagger"
log "  ${GREEN}Health:${RESET}   http://localhost:3000/health"
log "  ${GREEN}Prometheus:${RESET} http://localhost:9090"
log "  ${GREEN}Grafana:${RESET}    http://localhost:3001 (admin/admin123)"

echo
log "${YELLOW}To stop all services: ${RESET}docker-compose down"
log "${YELLOW}To view logs:        ${RESET}docker-compose logs -f"
