#!/usr/bin/env sh
# Generate the RSA keypair used to sign/verify access tokens (RS256).
# Private key is gitignored — never commit it.
# Note: `pnpm keys` (scripts/ensure-keys.mjs) is the portable, no-openssl default;
# this script is for manual/openssl-based generation or rotation.
set -e
cd "$(dirname "$0")"

if [ -f rsa.private ] && [ "$1" != "--force" ]; then
  echo "rsa.private already exists. Re-run with --force to rotate (invalidates live tokens)."
  exit 1
fi

umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out rsa.private
openssl rsa -in rsa.private -pubout -out rsa.public
chmod 600 rsa.private
echo "Generated src/keys/rsa.private (600) and src/keys/rsa.public"
