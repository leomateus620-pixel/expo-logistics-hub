/** A turn is indivisible: timestamps and identifiers must never reorder its reply. */
type Entry = { at: string; requestId?: string | null; role?: string; sequence?: number; kind?: string };
const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const sequenceOf = (value?: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : Infinity;

export function orderWorkerThreadEntries<T extends Entry>(entries: readonly T[], unsequencedOrder: 'admission' | 'chronological' = 'admission'): T[] {
  type Group = { entries: Array<{ entry: T; index: number }>; at: number; index: number; sequence: number; message: boolean };
  const groups = new Map<string | T, Group>();
  entries.forEach((entry, index) => {
    const key = entry.role && entry.requestId ? entry.requestId : entry;
    const group = groups.get(key) ?? { entries: [], at: timestamp(entry.at), index, sequence: Infinity, message: Boolean(entry.role) };
    group.entries.push({ entry, index });
    group.sequence = Math.min(group.sequence, sequenceOf(entry.sequence));
    if (entry.role === 'user') group.at = timestamp(entry.at);
    groups.set(key, group);
  });
  const chronologicalGroup = (a: Group, b: Group) => a.at - b.at || a.index - b.index;
  const turns = [...groups.values()].filter(group => group.message);
  // Persisted admission order has one comparison domain. Local turns are already
  // admitted by the hook and remain appended, even if a device clock regresses.
  const persisted = turns.filter(group => Number.isFinite(group.sequence)).sort((a, b) => a.sequence - b.sequence || a.index - b.index);
  const local = turns.filter(group => !Number.isFinite(group.sequence)).sort(unsequencedOrder === 'chronological' ? chronologicalGroup : (a, b) => a.index - b.index);
  const auxiliary = [...groups.values()].filter(group => !group.message).sort(chronologicalGroup);
  const ordered: Group[] = [];
  let cursor = 0; let admittedAt = -Infinity;
  // Merge auxiliary entries around complete turns. A monotonic watermark resolves
  // clock disagreement without a nontransitive sequence-vs-date comparator.
  for (const turn of [...persisted, ...local]) {
    admittedAt = Math.max(admittedAt, turn.at);
    while (cursor < auxiliary.length && (auxiliary[cursor].at < admittedAt || auxiliary[cursor].at === admittedAt && auxiliary[cursor].index < turn.index)) ordered.push(auxiliary[cursor++]);
    ordered.push(turn);
  }
  ordered.push(...auxiliary.slice(cursor));
  const rank = (role?: string) => role === 'user' ? 0 : role === 'assistant' ? 1 : 2;
  return ordered.flatMap(group => group.entries.sort((a, b) => rank(a.entry.role) - rank(b.entry.role)
    || sequenceOf(a.entry.sequence) - sequenceOf(b.entry.sequence) || a.index - b.index).map(({ entry }) => entry));
}

export function chronological<T extends { created_at: string; role: string; request_id?: string | null; message_seq?: number }>(rows: readonly T[]): T[] {
  // Legacy stored messages may predate message_seq; only the data adapter applies
  // timestamp fallback. The UI preserves the admitted order received from it.
  return orderWorkerThreadEntries(rows.map(row => ({ at: row.created_at, role: row.role, requestId: row.request_id, sequence: row.message_seq, row })), 'chronological').map(item => item.row);
}
