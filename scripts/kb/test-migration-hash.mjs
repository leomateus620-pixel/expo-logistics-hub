/** Read-only cross-platform check of the exact predecessor used by deployment. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { migrationLineEndingHashes } from './migration-hash.mjs';

const source = readFileSync(new URL('../../drizzle/migrations/0017_workers_identity_responses.sql', import.meta.url), 'utf8');
const lf = source.replace(/\r\n/g, '\n');
const crlf = lf.replace(/\n/g, '\r\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const expected = [hash(lf), hash(crlf)];
assert.notEqual(expected[0], expected[1], 'Fixture must exercise distinct LF/CRLF hashes');
assert.deepEqual(migrationLineEndingHashes(lf), expected);
assert.deepEqual(migrationLineEndingHashes(crlf), expected);
assert.ok(migrationLineEndingHashes(source).includes(hash(source)), 'Current checkout hash must be recognized');
assert.equal(migrationLineEndingHashes(`${lf}\nSELECT 1;\n`).some(value => expected.includes(value)), false, 'A SQL change cannot match the predecessor');
assert.equal(migrationLineEndingHashes(lf.replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')).some(value => expected.includes(value)), false, 'A changed function declaration cannot match the predecessor');
assert.equal(migrationLineEndingHashes(lf.replace(/ /, '  ')).some(value => expected.includes(value)), false, 'Even unrelated whitespace changes remain rejected');
console.log(JSON.stringify({ result: 'PASS', checks: 7, predecessor: '0017_workers_identity_responses', hashes: { lf: expected[0], crlf: expected[1] }, mutation: 'none' }));
