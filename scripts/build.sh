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
# dependencies cleanly, and packages the result to dist/<slug>-v<version>.tgz.
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
ZIP="$DIST/${NAME}-v${VERSION}.tgz"

echo "==> Building $PRODUCT v$VERSION"

# --- compile -------------------------------------------------------------------
echo "==> Compiling TypeScript"
# npx would fall back to the unrelated, deprecated "tsc" npm package when
# typescript is not installed locally - always use the project-local binary.
if [ ! -x node_modules/.bin/tsc ]; then
	npm install --include=dev --no-audit --no-fund
fi
./node_modules/.bin/tsc

# --- clean ---------------------------------------------------------------------
rm -rf "$STAGE" "$DIST/${NAME}-v${VERSION}.zip" "$ZIP"
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

# Add-ons without production dependencies legitimately end up without a
# node_modules folder - only fail when dependencies were expected.
HAS_DEPS="$(node -p "Object.keys(require('./package.json').dependencies||{}).length>0")"
if [ "true" = "$HAS_DEPS" ] && [ ! -d "$PKG_DIR/node_modules" ]; then
	echo "ERROR: node_modules missing after install — aborting." >&2
	exit 1
fi

# --- zip (archive contains a single top-level "<name>/" folder) ---------------
echo "==> Creating archive"
(
	cd "$STAGE"
	tar --exclude='.DS_Store' --exclude='.git' --exclude='npm-debug.log' -zcf "$ZIP" "$NAME"
)

SIZE="$(du -h "$ZIP" | cut -f1)"
echo
echo "==> Done: $ZIP  ($SIZE)"
echo "    Install: in Local choose Add-ons -> Install from disk and select the .tgz,"
echo "    then enable '$PRODUCT' under Add-ons -> Installed."
