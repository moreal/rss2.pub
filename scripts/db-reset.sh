#!/usr/bin/env sh
# Destroys the local development database.
#
# The schema comes back by itself on the next boot: migrate() recreates feeds
# and published_items, and the Fedify/BotKit tables self-create (their stores
# issue CREATE TABLE IF NOT EXISTS ahead of every operation). Registered feeds
# and actor key pairs do NOT come back — anyone already following a feed actor
# holds a key that will no longer exist. Local development only.
#
# The logic lives here rather than in a runner so both can call it:
#
#   yarn db:reset       # works in the nix devShell, which has no mise
#   mise run db:reset
#
# Keeping it out of `mise.toml`'s `run =` also keeps mise off the devShell's
# PATH: `mise run` provisions [tools] for every task regardless of what the
# task uses, which would put its own runtime-downloaded Node ahead of
# pkgs.nodejs_24 and quietly break what flake.lock is supposed to pin.
set -eu

# `docker compose` resolves its file against the cwd, and either runner may be
# invoked from a subdirectory.
cd "$(dirname "$0")/.."

if [ "${1-}" != "-y" ] && [ "${1-}" != "--yes" ]; then
  if [ ! -t 0 ]; then
    echo "db-reset: no terminal to confirm on; pass --yes to skip the prompt." >&2
    exit 1
  fi
  printf 'This deletes every row in the local database. Continue? [y/N] '
  # Ctrl-D closes stdin without a newline; `set -e` would otherwise end the
  # script here with no explanation.
  if ! read -r reply; then
    reply=""
    echo
  fi
  case "$reply" in
    y | Y | yes | YES) ;;
    *)
      echo "Aborted." >&2
      exit 1
      ;;
  esac
fi

docker compose down -v
docker compose up -d db
