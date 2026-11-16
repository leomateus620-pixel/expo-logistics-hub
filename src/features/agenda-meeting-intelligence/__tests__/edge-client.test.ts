import { describe, expect, it, vi } from 'vitest';
import { AgendaMeetingEdgeClient, AgendaMeetingEdgeError } from '../api/AgendaMeetingEdgeClient';
import type { AgendaMeetingSessionSummary, CapturedAudioSegment } from '../types';

const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const ORG_ID = '20000000-0000-4000-8000-000000000001';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';
const SEGMENT_ID = '40000000-0000-4000-8000-000000000001';

function sourceSegment(): CapturedAudioSegment {
  const audio = new Blob([new Uint8Array(44 + 3_200)], { type: 'audio/wav' });
  return {
    audio,
    metadata: {
      id: SEGMENT_ID,
      sessionId: SESSION_ID,
      sequence: 7,
      captureStartMs: 210_000,
      captureEndMs: 240_000,
      durationMs: 30_000,
      capturedAtIso: '2026-08-13T12:00:00.000Z',
      mimeType: 'audio/wav',
      bytes: audio.size,
      sha256: 'd'.repeat(64),
      backend: 'audio_worklet_wav',
      stats: { peakLevel: 0.4, rmsLevel: 0.1, voicedRatio: 0.6, sampleRate: 16_000 },
    },
  };
}

function client(fetcher: typeof fetch) {
  return new AgendaMeetingEdgeClient({
    supabaseUrl: 'https://project.supabase.co',
    publishableKey: 'sb_publishable_test',
    getAccessToken: async () => 'user-jwt',
    fetcher,
  });
}

describe('AgendaMeetingEdgeClient', () => {
  it('uploads the WAV part as multipart with its canonical identity and accepts a durable receipt', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ ok: true, status: 'accepted', receipt: { segmentId: SEGMENT_ID, sequence: 7, status: 'accepted', canonicalReceiptId: null, retryAfterMs: null, errorCode: null, durable: true } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await client(fetcher).uploadSegment({ segment: sourceSegment(), mutationId: 'mutation-id' });

    expect(result.receipt).toMatchObject({ segmentId: SEGMENT_ID, sequence: 7, status: 'accepted', durable: true });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://project.supabase.co/functions/v1/agenda-meeting-transcribe-segment');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer user-jwt');
    expect(headers.get('Content-Type')).toBeNull();
    const body = init?.body as FormData;
    expect(JSON.parse(String(body.get('metadata')))).toEqual({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      mutationId: 'mutation-id',
      sequence: 7,
      captureStartMs: 210_000,
      captureEndMs: 240_000,
      sha256: 'd'.repeat(64),
      stats: { peakLevel: 0.4, rmsLevel: 0.1, voicedRatio: 0.6, sampleRate: 16_000 },
    });
    const audio = body.get('audio') as File;
    expect(audio.type).toBe('audio/wav');
    expect(audio.size).toBe(44 + 3_200);
  });

  it('rejects inconsistent or non-audio parts before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const meetingClient = client(fetcher);
    const mismatched = sourceSegment();
    mismatched.metadata.bytes = mismatched.metadata.bytes + 10;
    await expect(meetingClient.uploadSegment({ segment: mismatched, mutationId: 'mutation-id' })).rejects.toMatchObject({ code: 'segment_size_mismatch' });

    const text = sourceSegment();
    text.metadata.mimeType = 'text/plain;charset=utf-8';
    await expect(meetingClient.uploadSegment({ segment: text, mutationId: 'mutation-id' })).rejects.toMatchObject({ code: 'segment_mime_unsupported' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces the uniform control envelope and classifies retryable HTTP failures', async () => {
    const invalid = client(
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ ok: true, action: 'list', result: { sessions: [] } }), {
          status: 200,
        }),
      ),
    );
    await expect(invalid.list({ mutationId: 'm', eventId: EVENT_ID, orgId: ORG_ID })).rejects.toMatchObject({
      code: 'invalid_control_response',
    });

    const unavailable = client(
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ code: 'provider_unavailable' }), { status: 503 }),
      ),
    );
    await expect(
      unavailable.list({ mutationId: 'm', eventId: EVENT_ID, orgId: ORG_ID }),
    ).rejects.toEqual(expect.objectContaining<Partial<AgendaMeetingEdgeError>>({
      code: 'provider_unavailable',
      retryable: true,
      status: 503,
    }));
  });

  it('replays a transient control failure once with the identical idempotency key', async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ code: 'temporary_failure' }), { status: 503 });
      }
      return new Response(
        JSON.stringify({ ok: true, action: 'list', data: { sessions: [] } }),
        { status: 200 },
      );
    });

    await expect(client(fetcher).list({
      mutationId: 'stable-mutation-id',
      eventId: EVENT_ID,
      orgId: ORG_ID,
    })).resolves.toEqual({ sessions: [] });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it('sends typed review/revision/action/delete operations through the same server contract', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const session = { id: SESSION_ID, version: 4 } as AgendaMeetingSessionSummary;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      const action = body.action;
      return new Response(JSON.stringify({ ok: true, action, data: { session } }), { status: 200 });
    });
    const meetingClient = client(fetcher);
    const base = {
      mutationId: 'mutation-id',
      eventId: EVENT_ID,
      orgId: ORG_ID,
      sessionId: SESSION_ID,
      expectedVersion: 4,
    };

    await meetingClient.createRevision({
      ...base,
      revision: {
        segments: [
          {
            sourceSegmentId: '70000000-0000-4000-8000-000000000001',
            text: 'Texto revisado',
          },
        ],
        reason: 'Nome próprio',
      },
    });
    await meetingClient.reviewMinutes({
      ...base,
      review: { minutesVersionId: '50000000-0000-4000-8000-000000000001', decision: 'approve' },
    });
    await meetingClient.updateAction({
      ...base,
      update: { actionId: '60000000-0000-4000-8000-000000000001', status: 'confirmed' },
    });
    await meetingClient.deleteMeeting(base);

    expect(requests.map((request) => request.action)).toEqual([
      'create_revision',
      'review_minutes',
      'update_action',
      'delete',
    ]);
    expect(requests[0]?.payload).toEqual({
      segments: [
        {
          sourceSegmentId: '70000000-0000-4000-8000-000000000001',
          text: 'Texto revisado',
        },
      ],
      reason: 'Nome próprio',
    });
  });
});
