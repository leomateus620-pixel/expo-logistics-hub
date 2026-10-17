import { createHash } from 'node:crypto';

/** Recognize only LF/CRLF serializations of the same checked-in SQL bytes. */
export function migrationLineEndingHashes(sql) {
  if (typeof sql !== 'string') throw new TypeError('Migration SQL must be text');
  const lf = sql.replace(/\r\n/g, '\n');
  const hash = text => createHash('sha256').update(text).digest('hex');
  return [...new Set([hash(lf), hash(lf.replace(/\n/g, '\r\n'))])];
}
