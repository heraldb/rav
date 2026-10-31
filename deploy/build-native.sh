#!/usr/bin/env bash
# Build Rav for CentOS Stream 10 and package it as dist/rav-<version>-el10.tar.gz
#
# Usage: deploy/build-native.sh
#   BASE_PATH=/rav deploy/build-native.sh   # only when serving under a sub-path
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' backend/Cargo.toml | head -1)
OUT=dist/rav-${VERSION}-el10
TARBALL=dist/rav-${VERSION}-el10.tar.gz

# Site-specific values live in the gitignored deploy/site.env
if [[ ! -f deploy/site.env ]]; then
    echo "error: deploy/site.env missing; copy deploy/site.env.example and fill it in" >&2
    exit 1
fi
set -a
. deploy/site.env
set +a
for var in RAV_DOMAIN RAV_MAIL_HOST RAV_PORT; do
    if [[ -z "${!var:-}" ]]; then
        echo "error: $var is not set in deploy/site.env" >&2
        exit 1
    fi
done

HELPER=contrib/password-helpers/dovecot-sql
if [[ ! -f "$HELPER" ]]; then
    echo "error: $HELPER missing (it comes with feat/password-change)" >&2
    exit 1
fi

rm -rf "$OUT" "$TARBALL"
mkdir -p "$OUT"

podman build \
    -f deploy/Containerfile.centos10 \
    --build-arg NEXT_PUBLIC_BASE_PATH="${BASE_PATH:-}" \
    -o type=local,dest="$OUT" \
    .

cp deploy/rav.service deploy/install.sh deploy/site.env "$OUT/rav/"
cp "$HELPER" "$OUT/rav/rav-passwd-dovecot-sql"
# Only substitute our own variables; nginx's $host etc. must stay literal
SITE_VARS='${RAV_DOMAIN} ${RAV_MAIL_HOST} ${RAV_PORT}'
envsubst "$SITE_VARS" < deploy/nginx-site.conf.in > "$OUT/rav/nginx-site.conf"
envsubst "$SITE_VARS" < deploy/rav.env.example.in > "$OUT/rav/rav.env.example"
# Record the exact source: `git log <commit>` shows what is deployed
git rev-parse HEAD > "$OUT/rav/BUILD_COMMIT" 2>/dev/null || true

tar -C "$OUT" -czf "$TARBALL" rav
echo "Built $TARBALL"
