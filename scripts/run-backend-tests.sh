#!/usr/bin/env bash
# Run the backend suite in the project's default environment, falling back to a
# local interpreter.
#
# D36: EITHER environment passing is sufficient, including when Compose ran the
# suite and failed. That is a deliberate trade-off by the project owner (the
# local path must stay usable where Docker is not), and the risk it accepts is
# recorded in design spec §6.2. The script therefore always prints WHICH
# environment produced the pass, so a divergence between the two shows up in
# the push output instead of passing silently.
#
# CI remains the authority: its `backend` job runs one environment, no fallback.
set -uo pipefail

compose_outcome="not attempted"
local_outcome="not attempted"

# Probe, never assume. A missing docker binary, a stopped stack and a failing
# exec must all route to the local attempt rather than abort the push.
compose_available() {
    command -v docker >/dev/null 2>&1 || return 1
    [ -n "$(docker compose ps --status running --quiet backend 2>/dev/null)" ]
}

if compose_available; then
    echo "==> pytest via docker compose"
    # The -e is load-bearing. The container's .env sets DJANGO_SETTINGS_MODULE to
    # config.settings.local, and pytest-django ranks that environment variable
    # ABOVE the ini value in pyproject.toml. Without the override the suite runs
    # on local settings — console email instead of locmem, no eager Celery — and
    # fails on tests that are correct.
    if docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -x -q; then
        echo "backend tests passed in: docker compose"
        exit 0
    fi
    compose_outcome="failed"
else
    compose_outcome="unavailable (no docker, or the backend service is not running)"
fi

echo "==> pytest via local uv"
# Reads POSTGRES_* from the shell, never from .env. Compose publishes its db on
# host port 5442, so reaching it from here needs POSTGRES_PORT=5442 exported;
# left unset, a local run targets localhost:5432.
if uv run --directory backend pytest -x -q; then
    echo "backend tests passed in: local uv"
    # Deliberate per D36, but named loudly: a Compose failure that a local pass
    # overrides is exactly the divergence worth seeing.
    if [ "$compose_outcome" = "failed" ]; then
        echo "NOTE: docker compose FAILED and local uv passed. CI runs Compose only — check this."
    fi
    exit 0
fi
local_outcome="failed"

echo
echo "backend tests failed in every environment attempted:"
echo "  docker compose : $compose_outcome"
echo "  local uv       : $local_outcome"
exit 1
