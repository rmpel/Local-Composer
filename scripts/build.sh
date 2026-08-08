#!/usr/bin/env bash

###
# Package: Composer Tools - First-class composer-based WordPress projects in Local.
# Version: see package.json
# License: see README.md and LICENSE
# Author: Remon Pel
# URL: https://github.com/rmpel/Local-Composer/
###

#
# build.sh — package Composer Tools as a distributable Local (LocalWP) add-on.
#
# Local add-ons ship as a folder that the user drops into Local's addons
# directory. That folder must be self-contained: compiled lib/ + a
# *production-only* node_modules (Local does not run `npm install` or tsc for
# the user). This script compiles, stages exactly those files, installs prod
# dependencies cleanly, and zips the result to dist/<slug>-v<version>.zip.
#
set -euo pipefail

cd "$(dirname "$0")"/.. || exit 1
ROOT=$(pwd -P)

# --- read identity from package.json ------------------------------------------
NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
PRODUCT="$(node -p "require('./package.json').productName || require('./package.json').name")"

STAGE="$ROOT/build"
PKG_DIR="$STAGE/$NAME"
DIST="$ROOT/dist"
ZIP="$DIST/${NAME}-v${VERSION}.zip"

echo "==> Building $PRODUCT v$VERSION"

# --- compile -------------------------------------------------------------------
echo "==> Compiling TypeScript"
npx tsc

# --- clean ---------------------------------------------------------------------
rm -rf "$STAGE" "$ZIP"
mkdir -p "$PKG_DIR" "$DIST"

# --- stage the files that ship in the add-on ----------------------------------
# Everything the add-on needs at runtime (lib/ is what package.json points at),
# plus license/readme and src for reference. Explicitly NOT: node_modules
# (installed fresh below), dist/, build/, .git, dotfiles.
echo "==> Staging files"
cp -R lib src "$PKG_DIR/"
cp package.json package-lock.json icon.svg README.md LICENSE CHANGELOG.md "$PKG_DIR/"

if [ -d scripts ]; then
	cp -R scripts "$PKG_DIR/"
fi

# --- install production dependencies into the staged copy ---------------------
echo "==> Installing production dependencies"
(
	cd "$PKG_DIR"
	if [ -f package-lock.json ]; then
		npm ci --omit=dev --no-audit --no-fund
	else
		npm install --omit=dev --no-audit --no-fund
	fi
)

if [ ! -d "$PKG_DIR/node_modules" ]; then
	echo "ERROR: node_modules missing after install — aborting." >&2
	exit 1
fi

# --- zip (archive contains a single top-level "<name>/" folder) ---------------
echo "==> Creating archive"
(
	cd "$STAGE"
	zip -rq "$ZIP" "$NAME" -x '*/.DS_Store' '*/.git/*' '*/npm-debug.log*'
)

SIZE="$(du -h "$ZIP" | cut -f1)"
echo
echo "==> Done: $ZIP  ($SIZE)"
echo "    Install: unzip into Local's addons directory, then restart Local"
echo "    and enable '$PRODUCT' under Add-ons -> Installed."
