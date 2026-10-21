export const supabase = {
  rpc(name: string, args: object) {
    const request = (signal?: AbortSignal) =>
      fetch("/isolated/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, args }),
        signal,
      }).then((r) => r.json());
    return {
      abortSignal: request,
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => request().then(resolve, reject),
    };
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
      }),
    }),
  }),
};
