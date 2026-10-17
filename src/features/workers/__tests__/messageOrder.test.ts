import { describe, expect, it } from 'vitest';
import { chronological, orderWorkerThreadEntries } from '../message-order';

const at = '2026-10-17T02:00:00Z';
describe('stable turn order', () => {
  it('groups each question and answer instead of grouping all questions first', () => {
    const rows = [
      { id: 'z', request_id: 'turn1', created_at: at, role: 'user', message_seq: 1 },
      { id: 'a', request_id: 'turn1', created_at: at, role: 'assistant', message_seq: 2 },
      { id: 'y', request_id: 'turn2', created_at: at, role: 'user', message_seq: 3 },
      { id: 'b', request_id: 'turn2', created_at: at, role: 'assistant', message_seq: 4 },
    ];
    expect(chronological([...rows].reverse()).map(row => row.id)).toEqual(['z', 'a', 'y', 'b']);
    expect(chronological(chronological(rows))).toEqual(rows);
  });
  it('keeps a late reply with its question even when a system event occurs between them', () => {
    const entries = [
      { id: 'question', requestId: 'r', role: 'user', at },
      { id: 'event', kind: 'event', at: '2026-10-17T02:00:01Z' },
      { id: 'reply', requestId: 'r', role: 'assistant', at: '2026-10-17T02:00:02Z' },
      { id: 'routine', kind: 'routine', at: '2026-10-17T02:00:03Z' },
    ];
    expect(orderWorkerThreadEntries(entries).map(row => row.id)).toEqual(['question', 'reply', 'event', 'routine']);
  });
  it('retains placeholder position when its content is updated and never compares UUIDs', () => {
    const entries = [
      { id: 'z-question', requestId: 'r', role: 'user', at },
      { id: 'a-reply', requestId: 'r', role: 'assistant', at, content: '' },
      { id: 'action', kind: 'action', at },
    ];
    expect(orderWorkerThreadEntries(entries).map(row => row.id)).toEqual(['z-question', 'a-reply', 'action']);
    expect(orderWorkerThreadEntries(entries.map(row => ({ ...row, content: 'updated' }))).map(row => row.id)).toEqual(['z-question', 'a-reply', 'action']);
  });
  it('merges auxiliary entries without mixing sequence and timestamp comparison domains', () => {
    const entries = [
      { id: 'q-later-clock', requestId: 'first', role: 'user', sequence: 1, at: '2026-10-17T03:00:00Z' },
      { id: 'a-later-clock', requestId: 'first', role: 'assistant', sequence: 2, at: '2026-10-17T03:00:01Z' },
      { id: 'q-earlier-clock', requestId: 'second', role: 'user', sequence: 3, at: '2026-10-17T01:00:00Z' },
      { id: 'a-earlier-clock', requestId: 'second', role: 'assistant', sequence: 4, at: '2026-10-17T01:00:01Z' },
      { id: 'local-q', requestId: 'live', role: 'user', at: '2026-10-17T00:55:00Z' },
      { id: 'local-placeholder', requestId: 'live', role: 'assistant', at: '2026-10-17T00:55:00Z' },
      { id: 'event-middle-clock', kind: 'event', at: '2026-10-17T02:00:00Z' },
      { id: 'action-later', kind: 'action', at: '2026-10-17T03:30:00Z' },
    ];
    const ordered = orderWorkerThreadEntries(entries);
    expect(ordered.map(entry => entry.id)).toEqual(['event-middle-clock', 'q-later-clock', 'a-later-clock', 'q-earlier-clock', 'a-earlier-clock', 'local-q', 'local-placeholder', 'action-later']);
    expect(orderWorkerThreadEntries(ordered)).toEqual(ordered);
    expect(orderWorkerThreadEntries(entries.map(entry => ({ ...entry, content: 'received delta' }))).map(entry => entry.id)).toEqual(ordered.map(entry => entry.id));
  });
  it('keeps newly admitted local turns in place despite a backwards device clock', () => {
    const entries = [
      { id: 'q1', requestId: 'first', role: 'user', at }, { id: 'a1', requestId: 'first', role: 'assistant', at },
      { id: 'q2', requestId: 'second', role: 'user', at: '2026-10-17T01:00:00Z' }, { id: 'a2', requestId: 'second', role: 'assistant', at: '2026-10-17T01:00:00Z' },
    ];
    expect(orderWorkerThreadEntries(entries).map(entry => entry.id)).toEqual(['q1', 'a1', 'q2', 'a2']);
  });
  it('sorts legacy stored turns chronologically in the data adapter', () => {
    const rows = [
      { id: 'a2', request_id: 'second', role: 'assistant', created_at: '2026-10-17T03:00:00Z' },
      { id: 'q2', request_id: 'second', role: 'user', created_at: '2026-10-17T03:00:00Z' },
      { id: 'a1', request_id: 'first', role: 'assistant', created_at: at }, { id: 'q1', request_id: 'first', role: 'user', created_at: at },
    ];
    expect(chronological(rows).map(row => row.id)).toEqual(['q1', 'a1', 'q2', 'a2']);
  });

});
