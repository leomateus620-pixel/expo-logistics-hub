import {
  MAX_SEGMENT_SEQUENCE,
  parseSegmentUploadMetadata,
} from "./contracts.ts";

function segmentRequest(sequence: number) {
  return new Request("https://example.test/functions/v1/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "audio/webm;codecs=opus",
      "X-Meeting-Session-Id": "10000000-0000-4000-8000-000000000001",
      "X-Meeting-Segment-Id": "20000000-0000-4000-8000-000000000001",
      "X-Meeting-Mutation-Id": "30000000-0000-4000-8000-000000000001",
      "X-Meeting-Sequence": String(sequence),
      "X-Meeting-Capture-Start-Ms": "0",
      "X-Meeting-Capture-End-Ms": "30000",
      "X-Meeting-Sha256": "a".repeat(64),
    },
  });
}

Deno.test("accepts the bounded segment sequence contract", () => {
  const metadata = parseSegmentUploadMetadata(
    segmentRequest(MAX_SEGMENT_SEQUENCE),
  );
  if (metadata.sequence !== MAX_SEGMENT_SEQUENCE) {
    throw new Error("valid bounded sequence was changed");
  }
});

Deno.test("rejects segment sequences outside the defensive meeting bound", () => {
  let received: unknown;
  try {
    parseSegmentUploadMetadata(segmentRequest(MAX_SEGMENT_SEQUENCE + 1));
  } catch (error) {
    received = error;
  }
  if (!(received instanceof Error)) {
    throw new Error("oversized sequence was accepted");
  }
});
