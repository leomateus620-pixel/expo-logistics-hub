/** Disposable local runtime only. Install embedded-postgres under /tmp/financial-postgres. */
const { default: EmbeddedPostgres } = await import(
  process.env.FINANCIAL_TEST_EMBEDDED_MODULE ||
    "/tmp/financial-postgres/node_modules/embedded-postgres/dist/index.js"
);
const pg = new EmbeddedPostgres({
  databaseDir: "/tmp/financial-postgres/data",
  user: "postgres",
  password: "local-financial-tests",
  port: 55438,
  persistent: true,
});
await pg.initialise();
await pg.start();
console.log(
  "Isolated PostgreSQL on localhost:55438; only disposable financial_composer_* databases are used.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
