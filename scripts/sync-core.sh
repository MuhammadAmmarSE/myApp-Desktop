#!/bin/sh
# core/ is a copy of packages/core in the app's repo (MuhammadAmmarSE/myApp), which is where it is
# edited. Copy it here after changing it there:  sh scripts/sync-core.sh ../myApp
set -e
APP="${1:-../myApp}"
SRC="$APP/packages/core"
[ -d "$SRC/src" ] || { echo "No $SRC/src. Pass the path to your myApp checkout."; exit 1; }
rm -rf core/src core/test
cp -r "$SRC/src" "$SRC/test" core/
cp "$SRC/tsconfig.json" core/tsconfig.json
echo "core synced from $SRC"
