#!/usr/bin/env bash

###
# Package: Composer Tools - First-class composer-based WordPress projects in Local.
# Version: see package.json
# License: see README.md and LICENSE
# Author: Remon Pel
###

# Installs the Composer Tools add-on into Local by symlinking this folder
# into Local's addons directory and installing its dependencies.
set -euo pipefail

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$(uname -s)" in
	Darwin) ADDONS_ROOT="$HOME/Library/Application Support/Local/addons" ;;
	Linux)  ADDONS_ROOT="$HOME/.config/Local/addons" ;;
	*) echo "On Windows, copy this folder to %AppData%\\Local\\addons and run 'npm install --omit=dev' inside it."; exit 1 ;;
esac

echo "Installing dependencies…"
cd "$ADDON_DIR"
# Dev dependencies included on purpose: typescript is needed to build lib/
# (package.json points Local at lib/, which a fresh checkout does not have).
npm install --include=dev --no-audit --no-fund

echo "Building…"
./node_modules/.bin/tsc

mkdir -p "$ADDONS_ROOT"
LINK="$ADDONS_ROOT/local-composer"
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
	echo "ERROR: $LINK already exists and is not a symlink — remove it first." >&2
	exit 1
fi
ln -sfn "$ADDON_DIR" "$LINK"

echo
echo "Linked: $LINK -> $ADDON_DIR"
echo "Now restart Local, open Add-ons -> Installed, enable 'Composer Tools', and relaunch."
echo "If the old 'Composer PHP Sync' (local-composer-php) add-on is enabled, disable it —"
echo "its functionality is integrated here and both would fight over the same row."
