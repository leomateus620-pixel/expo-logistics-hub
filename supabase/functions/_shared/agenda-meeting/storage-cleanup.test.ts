import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MEETING_AUDIO_BUCKET, MEETING_EXPORTS_BUCKET, removeSessionStorage } from "./supabase.ts";

// In-memory storage that lists one folder level at a time, like Supabase Storage.
function fakeAdmin(initial: Record<string, string[]>) {
  const buckets = new Map(Object.entries(initial).map(([bucket, paths]) => [bucket, new Set(paths)]));
  return {
    buckets,
    storage: {
      from(bucket: string) {
        const files = buckets.get(bucket) ?? new Set<string>();
        return {
          list(prefix: string) {
            const names = new Map<string, boolean>();
            for (const path of files) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const rest = path.slice(prefix.length + 1);
              const [head, ...tail] = rest.split("/");
              names.set(head, tail.length > 0 || names.get(head) === true);
            }
            return Promise.resolve({
              data: [...names].map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` })),
              error: null,
            });
          },
          remove(paths: string[]) {
            for (const path of paths) files.delete(path);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  };
}

Deno.test("removeSessionStorage apaga áudio e exportações dentro das subpastas da sessão", async () => {
  const root = "org/event/session";
  const admin = fakeAdmin({
    [MEETING_AUDIO_BUCKET]: [`${root}/audio/a.wav`, `${root}/audio/b.wav`, "org/event/other/audio/keep.wav"],
    [MEETING_EXPORTS_BUCKET]: [`${root}/exports/r.pdf`, `${root}/exports/t.txt`],
  });
  // deno-lint-ignore no-explicit-any
  const removed = await removeSessionStorage(admin as any, { orgId: "org", eventId: "event", sessionId: "session" });
  assertEquals(removed, 4);
  assertEquals([...admin.buckets.get(MEETING_AUDIO_BUCKET)!], ["org/event/other/audio/keep.wav"]);
  assertEquals(admin.buckets.get(MEETING_EXPORTS_BUCKET)!.size, 0);
});
