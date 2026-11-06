import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(
    process.env.TEAM_PG_MODULE ||
      "/tmp/fenasoja-tooling/node_modules/embedded-postgres/dist/index.js",
  )
);
const pg = new EmbeddedPostgres({
  databaseDir: "/tmp/fenasoja-volunteers-pg",
  user: "postgres",
  password: "local-test-only",
  port: 55441,
  persistent: false,
  onLog: () => {},
  onError: () => {},
});
await pg.initialise();
await pg.start();
const db = pg.getPgClient();
await db.connect();
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
};
const ids = Object.fromEntries(
  [
    "org",
    "org2",
    "unit",
    "otherUnit",
    "foreignUnit",
    "admin",
    "lead",
    "otherLead",
    "volunteer",
    "oldLead",
    "legacy",
    "event",
    "subevent",
  ].map((k) => [k, randomUUID()]),
);
async function as(user, sql, args = []) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    const r = await db.query(sql, args);
    await db.query("COMMIT");
    return r.rows;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
const save = (
  user,
  unit,
  name,
  email,
  request = randomUUID(),
  person = null,
  version = null,
) =>
  as(user, "SELECT public.team_save_volunteer($1,$2,$3,$4,$5,$6) result", [
    unit,
    request,
    name,
    email,
    person,
    version,
  ]).then((r) => r[0].result);
const denied = async (fn) => assert.rejects(fn, (e) => e.code === "42501");
try {
  await db.query(
    await readFile("scripts/volunteers/schema-fixture.sql", "utf8"),
  );
  for (const key of ["admin", "lead", "otherLead", "volunteer", "oldLead"])
    await db.query("INSERT INTO auth.users VALUES($1)", [ids[key]]);
  await db.query("INSERT INTO organizations(id,nome) VALUES($1,$3),($2,$4)", [
    ids.org,
    ids.org2,
    "QA org",
    "Foreign QA org",
  ]);
  for (const [unit, org] of [
    ["unit", "org"],
    ["otherUnit", "org"],
    ["foreignUnit", "org2"],
  ])
    await db.query(
      "INSERT INTO commissions(id,org_id,nome,slug) VALUES($1,$2,$3,$3)",
      [ids[unit], ids[org], unit],
    );
  for (const key of ["admin", "lead", "otherLead", "volunteer", "oldLead"])
    await db.query(
      "INSERT INTO org_members(org_id,user_id,role,nome_exibicao) VALUES($1,$2,$3,$4)",
      [ids.org, ids[key], key === "admin" ? "admin" : "leitura", `QA ${key}`],
    );
  for (const [key, unit] of [
    ["lead", "unit"],
    ["otherLead", "otherUnit"],
  ])
    await db.query(
      "INSERT INTO commission_responsibles(org_id,commission_id,user_id,display_name) VALUES($1,$2,$3,$4)",
      [ids.org, ids[unit], ids[key], `QA ${key}`],
    );
  await db.query(
    "INSERT INTO commission_responsibles(id,org_id,commission_id,display_name,relationship_role) VALUES($1,$2,$3,'Legacy no email','equipe_apoio')",
    [ids.legacy, ids.org, ids.unit],
  );
  await db.query(
    "INSERT INTO cronograma_eventos(id,org_id,title,source_year,start_date) VALUES($1,$2,'QA historical',2026,'2026-04-01')",
    [ids.event, ids.org],
  );
  await db.query(
    "INSERT INTO cronograma_subeventos(id,org_id,parent_event_id) VALUES($1,$2,$3)",
    [ids.subevent, ids.org, ids.event],
  );
  await db.query(
    "INSERT INTO cronograma_evento_responsaveis(event_id,org_id,org_member_user_id,name_snapshot) VALUES($1,$2,$3,'Historical original name')",
    [ids.event, ids.org, ids.lead],
  );
  const oldId = (
    await db.query("SELECT id FROM cronograma_evento_responsaveis")
  ).rows[0].id;
  for (const file of [
    "20261106090000_commission_volunteers.sql",
    "20261106091000_commission_people_agenda.sql",
    "20261106092000_team_reconciliation_cleanup.sql",
    "20261106103000_team_conflict_response.sql",
  ])
    await db.query(await readFile(`supabase/migrations/${file}`, "utf8"));
  await check(
    "Backfill preserves membership IDs, historical event IDs and snapshots",
    async () => {
      assert.equal(
        (
          await db.query(
            "SELECT person_id FROM commission_responsibles WHERE id=$1",
            [ids.legacy],
          )
        ).rows[0].person_id,
        ids.legacy,
      );
      const old = (
        await db.query(
          "SELECT * FROM cronograma_evento_responsaveis WHERE id=$1",
          [oldId],
        )
      ).rows[0];
      assert(old.person_id);
      assert.equal(old.name_snapshot, "Historical original name");
    },
  );
  const request = randomUUID();
  let person;
  await check(
    "Leader creates a person, private contact and membership without auth account",
    async () => {
      person = await save(
        ids.lead,
        ids.unit,
        "QA Volunteer",
        " Mixed+Tag@Example.invalid ",
        request,
      );
      const row = (
        await db.query("SELECT * FROM commission_people WHERE id=$1", [
          person.person_id,
        ])
      ).rows[0];
      assert.equal(row.user_id, null);
      assert.equal(
        (
          await as(ids.lead, "SELECT team_admin_contacts($1) contacts", [
            ids.unit,
          ])
        )[0].contacts.find((c) => c.person_id === person.person_id).email,
        "mixed+tag@example.invalid",
      );
    },
  );
  await check("Retry is idempotent and detects changed payload", async () => {
    assert.deepEqual(
      await save(
        ids.lead,
        ids.unit,
        "QA Volunteer",
        " Mixed+Tag@Example.invalid ",
        request,
      ),
      person,
    );
    await assert.rejects(
      () =>
        save(
          ids.lead,
          ids.unit,
          "Changed",
          " Mixed+Tag@Example.invalid ",
          request,
        ),
      (e) => e.code === "22023",
    );
  });
  await check(
    "Same-unit duplicate rejected; homonyms keep distinct identities",
    async () => {
      await assert.rejects(
        () =>
          save(ids.lead, ids.unit, "Another name", "mixed+tag@example.invalid"),
        (e) => e.code === "23505",
      );
      assert.notEqual(
        (
          await save(
            ids.lead,
            ids.unit,
            "QA Volunteer",
            "homonym@example.invalid",
          )
        ).person_id,
        person.person_id,
      );
    },
  );
  await check(
    "Cross-unit match creates only a private reconciliation request",
    async () => {
      const response = await save(
        ids.otherLead,
        ids.otherUnit,
        "Submitted name",
        "mixed+tag@example.invalid",
      );
      assert.deepEqual(response, { reconciliation_required: true });
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM commission_people WHERE display_name=$1",
            ["Submitted name"],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  for (const actor of ["otherLead", "volunteer", "oldLead"])
    await check(
      `${actor} cannot read private contacts or forge writes`,
      async () => {
        await denied(() =>
          as(ids[actor], "SELECT team_admin_contacts($1)", [ids.unit]),
        );
        await denied(() =>
          save(ids[actor], ids.unit, "Forbidden", "no@example.invalid"),
        );
        await denied(() =>
          as(ids[actor], "SELECT * FROM team_private.contacts"),
        );
        await denied(() =>
          as(
            ids[actor],
            "UPDATE commission_responsibles SET relationship_role='principal' WHERE person_id=$1",
            [person.person_id],
          ),
        );
      },
    );
  await check(
    "Organization admin cannot write another organization",
    async () => {
      await denied(() =>
        save(ids.admin, ids.foreignUnit, "Forbidden", "no@example.invalid"),
      );
    },
  );
  await check("Anonymous cannot use RPC or contact schema", async () => {
    for (const sql of [
      "SELECT * FROM team_private.contacts",
      "SELECT team_admin_contacts($1)",
    ]) {
      await db.query("BEGIN");
      await db.query("SET LOCAL ROLE anon");
      await assert.rejects(
        () => db.query(sql, sql.includes("$1") ? [ids.unit] : []),
        (e) => e.code === "42501",
      );
      await db.query("ROLLBACK");
    }
  });
  await check(
    "Names/emails cannot change auth identity and stale update fails",
    async () => {
      const updated = await save(
        ids.lead,
        ids.unit,
        "QA renamed",
        "changed@example.invalid",
        randomUUID(),
        person.person_id,
        person.version,
      );
      person = updated;
      await assert.rejects(
        () =>
          save(
            ids.lead,
            ids.unit,
            "Lost update",
            "lost@example.invalid",
            randomUUID(),
            person.person_id,
            1,
          ),
        (e) => e.code === "PT409",
      );
      assert.equal(
        (
          await db.query("SELECT user_id FROM commission_people WHERE id=$1", [
            person.person_id,
          ])
        ).rows[0].user_id,
        null,
      );
    },
  );
  await check(
    "Invitation failure/retry never creates another person or account",
    async () => {
      const a = (
        await as(ids.lead, "SELECT team_request_access($1,$2) result", [
          ids.unit,
          person.person_id,
        ])
      )[0].result;
      const b = (
        await as(ids.lead, "SELECT team_request_access($1,$2) result", [
          ids.unit,
          person.person_id,
        ])
      )[0].result;
      assert.deepEqual(a, b);
      assert.equal(a.attempts, 1);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,
        5,
      );
    },
  );
  await check(
    "Agenda links the stable person, returns no email and preserves IDs on edit",
    async () => {
      const payload = [
        { person_id: person.person_id, name: "Spoofed name", is_primary: true },
      ];
      await as(
        ids.lead,
        "SELECT _cronograma_apply_event_responsibles($1,$2,$3)",
        [ids.event, ids.org, JSON.stringify(payload)],
      );
      const id = (
        await db.query(
          "SELECT id FROM cronograma_evento_responsaveis WHERE person_id=$1",
          [person.person_id],
        )
      ).rows[0].id;
      await as(
        ids.lead,
        "SELECT _cronograma_apply_event_responsibles($1,$2,$3)",
        [ids.event, ids.org, JSON.stringify(payload)],
      );
      assert.equal(
        (
          await db.query(
            "SELECT id FROM cronograma_evento_responsaveis WHERE person_id=$1",
            [person.person_id],
          )
        ).rows[0].id,
        id,
      );
      const output = (
        await db.query(
          "SELECT responsibles_rel FROM cronograma_eventos_full WHERE id=$1",
          [ids.event],
        )
      ).rows[0].responsibles_rel;
      assert.equal(output[0].name, "QA renamed");
      assert.equal(output[0].person_id, person.person_id);
      assert(!JSON.stringify(output).includes("email"));
      assert.equal(output[0].user_id, null);
    },
  );
  await check(
    "Admin can link another unit; leaders cannot change shared identity/contact of other unit",
    async () => {
      await as(ids.admin, "SELECT team_link_existing_person($1,$2,$3)", [
        ids.otherUnit,
        person.person_id,
        "scope-two@example.invalid",
      ]);
      await denied(() =>
        save(
          ids.lead,
          ids.unit,
          "Global takeover",
          "changed@example.invalid",
          randomUUID(),
          person.person_id,
          person.version,
        ),
      );
      person = await save(
        ids.lead,
        ids.unit,
        "QA renamed",
        "scope-one@example.invalid",
        randomUUID(),
        person.person_id,
        person.version,
      );
      const contacts = (
        await as(ids.otherLead, "SELECT team_admin_contacts($1) contacts", [
          ids.otherUnit,
        ])
      )[0].contacts;
      assert.equal(
        contacts.find((c) => c.person_id === person.person_id).email,
        "scope-two@example.invalid",
      );
    },
  );
  await check(
    "Inactivation preserves events and membership in other units",
    async () => {
      await as(ids.lead, "SELECT team_deactivate_volunteer($1,$2,1)", [
        ids.unit,
        person.person_id,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM cronograma_evento_responsaveis WHERE person_id=$1",
            [person.person_id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM commission_responsibles WHERE person_id=$1 AND active",
            [person.person_id],
          )
        ).rows[0].n,
        1,
      );
      await as(ids.otherLead, "SELECT team_deactivate_volunteer($1,$2,1)", [
        ids.otherUnit,
        person.person_id,
      ]);
      await assert.rejects(
        () =>
          as(
            ids.lead,
            "SELECT _cronograma_apply_subevent_responsibles($1,$2,$3)",
            [
              ids.subevent,
              ids.org,
              JSON.stringify([{ person_id: person.person_id }]),
            ],
          ),
        (e) => e.code === "22023",
      );
    },
  );
  await check(
    "Revocation follows active leadership, never created_by",
    async () => {
      await db.query(
        "UPDATE commission_responsibles SET active=false WHERE user_id=$1",
        [ids.lead],
      );
      await denied(() =>
        as(ids.lead, "SELECT team_admin_contacts($1)", [ids.unit]),
      );
      await denied(() =>
        save(ids.lead, ids.unit, "Revoked", "revoked@example.invalid"),
      );
    },
  );
  await check(
    "Storage denies writes and private RPCs; public projections contain no contact",
    async () => {
      await denied(() =>
        as(
          ids.volunteer,
          "INSERT INTO storage.objects(bucket_id,name) VALUES('team-avatars','forged.webp')",
        ),
      );
      await denied(() =>
        as(ids.volunteer, "SELECT team_avatar_commit($1,$2,$3,1,NULL,$4)", [
          ids.volunteer,
          ids.unit,
          person.person_id,
          randomUUID(),
        ]),
      );
      const p = await as(
        ids.volunteer,
        "SELECT row_to_json(p) value FROM commission_people p LIMIT 1",
      );
      assert(!("email" in p[0].value));
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM pg_publication_tables WHERE schemaname='team_private'",
          )
        ).rows[0].n,
        0,
      );
    },
  );
  // Independent database sessions exercise advisory locks and unique indexes under real concurrency.
  await check(
    "Photo commits/removals are idempotent; stale versions and shared identity edits fail",
    async () => {
      const p = await save(
        ids.admin,
        ids.unit,
        "Photo QA",
        "photo@example.invalid",
      );
      const requestId = randomUUID();
      const prepared = (
        await as(ids.admin, "SELECT team_avatar_prepare($1,$2,$3,$4) result", [
          ids.unit,
          p.person_id,
          p.version,
          requestId,
        ])
      )[0].result;
      assert(!prepared.path.includes("Photo"));
      assert(!prepared.path.includes("example"));
      await db.query(
        "INSERT INTO storage.objects(bucket_id,name) VALUES('team-avatars',$1)",
        [prepared.path],
      );
      const commitArgs = [
        ids.admin,
        ids.unit,
        p.person_id,
        p.version,
        prepared.path,
        requestId,
      ];
      const committed = (
        await db.query(
          "SELECT team_avatar_commit($1,$2,$3,$4,$5,$6) result",
          commitArgs,
        )
      ).rows[0].result;
      assert.equal(committed.version, 2);
      assert.equal(
        (
          await db.query(
            "SELECT team_avatar_commit($1,$2,$3,$4,$5,$6) result",
            commitArgs,
          )
        ).rows[0].result.version,
        2,
      );
      assert.equal(
        (
          await as(
            ids.admin,
            "SELECT team_avatar_prepare($1,$2,$3,$4) result",
            [ids.unit, p.person_id, 1, requestId],
          )
        )[0].result.already_committed,
        true,
      );
      const removal = randomUUID();
      const args = [ids.admin, ids.unit, p.person_id, 2, null, removal];
      assert.equal(
        (
          await db.query(
            "SELECT team_avatar_commit($1,$2,$3,$4,$5,$6) result",
            args,
          )
        ).rows[0].result.version,
        3,
      );
      assert.equal(
        (
          await db.query(
            "SELECT team_avatar_commit($1,$2,$3,$4,$5,$6) result",
            args,
          )
        ).rows[0].result.version,
        3,
      );
      await assert.rejects(
        () =>
          as(ids.admin, "SELECT team_avatar_prepare($1,$2,1,$3)", [
            ids.unit,
            p.person_id,
            randomUUID(),
          ]),
        (e) => e.code === "PT409",
      );
      await as(ids.admin, "SELECT team_link_existing_person($1,$2,$3)", [
        ids.otherUnit,
        p.person_id,
        "other-photo@example.invalid",
      ]);
      await denied(() =>
        as(ids.otherLead, "SELECT team_avatar_prepare($1,$2,3,$3)", [
          ids.otherUnit,
          p.person_id,
          randomUUID(),
        ]),
      );
      await db.query(
        "UPDATE team_private.avatar_objects SET created_at=now()-interval '2 days' WHERE path=$1",
        [prepared.path],
      );
      assert(
        (
          await db.query("SELECT team_avatar_orphans() paths")
        ).rows[0].paths.includes(prepared.path),
      );
    },
  );
  await check(
    "Reconciliation and access queues are admin-only and never provision an account",
    async () => {
      await denied(() =>
        as(ids.otherLead, "SELECT team_reconciliation_requests($1)", [ids.org]),
      );
      const p = await save(
        ids.admin,
        ids.unit,
        "Queue QA",
        "queue@example.invalid",
      );
      await save(
        ids.otherLead,
        ids.otherUnit,
        "Queue proposed",
        "queue@example.invalid",
      );
      const requests = (
        await as(ids.admin, "SELECT team_reconciliation_requests($1) result", [
          ids.org,
        ])
      )[0].result;
      const request = requests.find((r) => r.email === "queue@example.invalid");
      assert.equal(request.candidates[0].person_id, p.person_id);
      await denied(() =>
        as(ids.otherLead, "SELECT team_resolve_reconciliation($1,$2)", [
          request.id,
          p.person_id,
        ]),
      );
      await as(ids.admin, "SELECT team_resolve_reconciliation($1,$2)", [
        request.id,
        p.person_id,
      ]);
      await as(ids.admin, "SELECT team_resolve_reconciliation($1,$2)", [
        request.id,
        p.person_id,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM commission_responsibles WHERE person_id=$1",
            [p.person_id],
          )
        ).rows[0].n,
        2,
      );
      const access = (
        await as(ids.otherLead, "SELECT team_request_access($1,$2) result", [
          ids.otherUnit,
          p.person_id,
        ])
      )[0].result;
      await denied(() =>
        as(
          ids.otherLead,
          "SELECT team_update_access_request($1,'requested','completed')",
          [access.id],
        ),
      );
      await as(
        ids.admin,
        "SELECT team_update_access_request($1,'requested','processing')",
        [access.id],
      );
      await assert.rejects(
        () =>
          as(
            ids.admin,
            "SELECT team_update_access_request($1,'requested','completed')",
            [access.id],
          ),
        (e) => e.code === "PT409",
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,
        5,
      );
    },
  );
  await check(
    "Legacy trusted inserts get an identity; direct contact joins/exports remain denied",
    async () => {
      const inserted = (
        await db.query(
          "INSERT INTO commission_responsibles(org_id,commission_id,display_name,relationship_role) VALUES($1,$2,'Legacy trusted','equipe_apoio') RETURNING id,person_id",
          [ids.org, ids.unit],
        )
      ).rows[0];
      assert.equal(inserted.id, inserted.person_id);
      await denied(() =>
        as(
          ids.volunteer,
          "SELECT p.display_name,c.email FROM commission_people p JOIN team_private.contacts c ON c.person_id=p.id",
        ),
      );
      await denied(() =>
        as(ids.otherLead, "COPY team_private.contacts TO STDOUT"),
      );
    },
  );
  await check("Concurrent identical requests insert exactly once", async () => {
    const command = randomUUID();
    const clients = Array.from({ length: 4 }, () => pg.getPgClient());
    try {
      const replies = await Promise.all(
        clients.map(async (c) => {
          await c.connect();
          await c.query("BEGIN");
          await c.query("SET LOCAL ROLE authenticated");
          await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
            ids.admin,
          ]);
          const r = await c.query(
            "SELECT team_save_volunteer($1,$2,$3,$4) result",
            [ids.unit, command, "Concurrent", "concurrent@example.invalid"],
          );
          await c.query("COMMIT");
          return r.rows[0].result;
        }),
      );
      assert(replies.every((r) => r.person_id === replies[0].person_id));
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
  await mkdir("docs/volunteers/evidence", { recursive: true });
  await writeFile(
    "docs/volunteers/evidence/database-tests.json",
    JSON.stringify(
      {
        database: "disposable PostgreSQL",
        executedAt: new Date().toISOString(),
        passed: results.length,
        tests: results,
      },
      null,
      2,
    ),
  );
  console.log(`${results.length} database scenarios passed`);
} finally {
  await db.end();
  await pg.stop();
}
