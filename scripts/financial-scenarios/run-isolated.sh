#!/bin/sh
set -eu
# Prerequisite: start-isolated-postgres.mjs on 127.0.0.1:55438.
FINANCIAL_APPLY_COMPOSER=1 node scripts/financial-2028/isolated-bootstrap.mjs
node scripts/financial-2028/database-qa.mjs
node scripts/financial-scenarios/database-qa.mjs
node scripts/financial-scenarios/envelope-qa.mjs
