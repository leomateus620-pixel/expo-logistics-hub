// This adapter is aliased only by review.vite.config.ts. All financial data comes from local SQL.
export let reviewActor = "";
export const setReviewActor = (actor: string) => {
  reviewActor = actor;
};
const request = async (path: string, body: unknown) =>
  fetch(`/isolated${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-financial-test-actor": reviewActor,
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());
export const supabase = {
  rpc: (name: string, args: unknown) => request("/rpc", { name, args }),
  from: (table: string) => {
    const query = { table, filters: [] as unknown[][], order: "", limit: 500 };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        query.filters.push([key, value]);
        return builder;
      },
      order: (key: string) => {
        query.order = key;
        return builder;
      },
      limit: (n: number) => {
        query.limit = n;
        return builder;
      },
      then: (
        resolve: (r: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => request("/read", query).then(resolve, reject),
    };
    return builder;
  },
};
