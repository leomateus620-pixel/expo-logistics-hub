const fs=require("node:fs");const path=require("node:path");const ROOT=path.resolve(__dirname,"../..");
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const projectUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)[1];
const projectHost = new URL(projectUrl).hostname;
const authKey = `sb-${projectHost.split(".")[0]}-auth-token`;
const user = {
  id: "00000000-0000-4000-8000-000000000101",
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic-history-qa@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const org = "00000000-0000-4000-8000-000000000102";
const session = {
  access_token: `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: 4102444800, role: "authenticated" })).toString("base64url")}.synthetic-browser-fixture`,
  refresh_token: "synthetic-browser-fixture",
  token_type: "bearer",
  expires_in: 315360000,
  expires_at: 4102444800,
  user,
};


exports.install=async(context)=>{
  const mocked = [];
  const mutations = [];
  await context.route(`https://${projectHost}/**`, async (route) => {
    const req = route.request();
    const target = new URL(req.url());
    mocked.push({ method: req.method(), path: target.pathname });
    let response = [];
    if (target.pathname.endsWith("/auth/v1/user")) response = user;
    else if (target.pathname.endsWith("/auth/v1/token")) response = session;
    else if (target.pathname.endsWith("/rest/v1/org_members"))
      response = [
        {
          id: "qa-member",
          org_id: org,
          role: "admin",
          nome_exibicao: "Validação local",
          cargo: "QA",
          organizations: { id: org, nome: "Fenasoja — fixture local" },
        },
      ];
    else if (target.pathname.endsWith("/rest/v1/user_roles"))
      response = [{ role: "admin" }];
    else if (target.pathname.endsWith("/rest/v1/map_projects")) response = null;
    else if (
      target.pathname.endsWith("/rest/v1/rpc/expire_commercial_reservations")
    )
      response = 0;
    else if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      mutations.push({ method: req.method(), path: target.pathname });
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "QA fixture forbids backend mutation",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await context.addInitScript(
    ({ authKey, session, org, userId }) => {
      localStorage.setItem(authKey, JSON.stringify(session));
      localStorage.setItem("fenasoja_org_id", org);
      localStorage.setItem("fenasoja-last-user-id", userId);
    },
    { authKey, session, org, userId: user.id },
  );

return {mocked,mutations};
};
