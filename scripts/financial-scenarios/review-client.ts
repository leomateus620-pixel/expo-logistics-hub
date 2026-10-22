export { setReviewActor, reviewActor } from "../financial-2028/review-client";
import { supabase as sql } from "../financial-2028/review-client";
// Realtime is not emulated: this harness reads actual local PostgreSQL via the guarded bridge.
const channel = { on: () => channel, subscribe: () => channel };
export const supabase = {
  ...sql,
  channel: () => channel,
  removeChannel: async () => {},
};
