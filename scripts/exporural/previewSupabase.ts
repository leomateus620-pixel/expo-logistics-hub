/** Local harness only: every database, storage or write call fails closed. */
const forbidden = () => { throw new Error('LOCAL_PREVIEW_NO_DATABASE_ACCESS'); };
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: forbidden, signOut: forbidden,
  },
  from: forbidden, rpc: forbidden, channel: forbidden,
  storage: { from: forbidden }, removeChannel: forbidden,
};
