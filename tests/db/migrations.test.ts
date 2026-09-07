// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;

async function fixture() {
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const clusterId = randomUUID();
  const answerId = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [ownerId]);
  await db.query("insert into public.sessions(id, owner_id, question, max_score, status) values ($1,$2,'Question',2,'ready')", [sessionId, ownerId]);
  await db.query("insert into public.clusters(id,session_id,label,why,tone,severity) values ($1,$2,'Belief','Evidence',1,3)", [clusterId, sessionId]);
  const lesson = Array.from({ length: 5 }, (_, i) => ({ heading: `Section ${i}`, body: "A short lesson." }));
  const diagnostics = Array.from({ length: 2 }, (_, i) => ({
    prompt: `Question ${i + 1}`, holderAnswers: "private-holder-rubric", correctedAnswers: "private-corrected-rubric",
  }));
  await db.query("insert into public.reteach_packs(session_id,cluster_id,lesson,diagnostics) values ($1,$2,$3,$4)", [sessionId, clusterId, JSON.stringify(lesson), JSON.stringify(diagnostics)]);
  const inserted = await db.query<{ diagnostic_token: string }>("insert into public.answers(id,session_id,cluster_id,student_ref,answer) values ($1,$2,$3,'STUDENT-PRIVATE','Original answer') returning diagnostic_token", [answerId, sessionId, clusterId]);
  return { ownerId, sessionId, clusterId, answerId, token: inserted.rows[0].diagnostic_token };
}

async function asService<T>(work: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role; select set_config('request.jwt.claim.role', 'service_role', false)");
  try { return await work(); }
  finally {
    await db.exec("reset role; select set_config('request.jwt.claim.role', '', false)");
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, is_anonymous boolean default false,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const directory = join(process.cwd(), "supabase/migrations");
  for (const name of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    // pgvector is unused by these transactions. PGlite ships pgcrypto but not
    // vector, so adapt only that storage column; execute all application SQL.
    const sql = readFileSync(join(directory, name), "utf8")
      .replace(/create extension if not exists "vector";/g, "")
      .replace(/vector\(768\)/g, "real[]");
    await db.exec(sql);
  }
}, 120_000);

afterAll(async () => { await db?.close(); });

it("denies public callers permission to forge a diagnostic verdict", async () => {
  const result = await db.query<{ allowed: boolean }>(`
    select has_function_privilege('anon',
      'public.grade_diagnostic_response(text,integer,text,text)', 'EXECUTE') as allowed
  `);
  expect(result.rows[0].allowed).toBe(false);
  const signedIn = await db.query<{ allowed: boolean }>(`
    select has_function_privilege('authenticated',
      'public.grade_diagnostic_response(text,integer,text,text)', 'EXECUTE') as allowed
  `);
  expect(signedIn.rows[0].allowed).toBe(false);
});

it("restricts ordinary diagnostic response access to reading owned results", async () => {
  const policies = await db.query<{ cmd: string }>(`
    select cmd from pg_policies
    where schemaname = 'public' and tablename = 'diagnostic_responses'
  `);
  expect(policies.rows.length).toBeGreaterThan(0);
  expect(policies.rows.every((policy) => policy.cmd === "SELECT")).toBe(true);
});

it("revokes inherited default grants on every server-only grading function", async () => {
  const signatures = [
    "public.submit_diagnostic_attempt(text,jsonb)",
    "public.claim_diagnostic_grading(text)",
    "public.complete_diagnostic_grading(text,uuid,jsonb)",
    "public.release_diagnostic_grading(text,uuid)",
    "public.authorize_ai_request(text,text)",
  ];
  for (const signature of signatures) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const result = await db.query<{ allowed: boolean }>("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, signature]);
      expect(result.rows[0].allowed, `${role}: ${signature}`).toBe(role === "service_role");
    }
  }
});

it("shows a token holder question prompts without the grading rubric or student identity", async () => {
  const own = await fixture();
  await db.exec("set role anon");
  try {
    const result = await db.query("select * from public.diagnostic_for_token($1)", [own.token]);
    expect(result.rows).toHaveLength(1);
    const visible = JSON.stringify(result.rows);
    expect(visible).toContain("Question 1");
    expect(visible).not.toContain("private-holder-rubric");
    expect(visible).not.toContain("private-corrected-rubric");
    expect(visible).not.toContain("STUDENT-PRIVATE");
    const otherRows = await db.query("select id from public.answers");
    expect(otherRows.rows).toEqual([]);
  } finally {
    await db.exec("reset role");
  }
});

it("rejects answer and reteach references to a cluster in another session", async () => {
  const own = await fixture();
  const other = await fixture();
  await expect(db.query("update public.answers set cluster_id=$1 where id=$2", [other.clusterId, own.answerId])).rejects.toThrow();
  await expect(db.query("update public.reteach_packs set session_id=$1 where cluster_id=$2", [other.sessionId, own.clusterId])).rejects.toThrow();
});

it("records two answers atomically and keeps the first attempt immutable", async () => {
  const own = await fixture();
  await asService(async () => {
    const invalid = await db.query<{ result: { status: string } }>(
      "select public.submit_diagnostic_attempt($1,$2::jsonb) as result", [own.token, JSON.stringify(["Only one"])]);
    expect(invalid.rows[0].result.status).toBe("invalid_responses");
    expect((await db.query("select * from public.diagnostic_responses where answer_id=$1", [own.answerId])).rows).toHaveLength(0);
    const first = ["My first reasoning", "My second reasoning"];
    const submitted = await db.query<{ result: { status: string } }>(
      "select public.submit_diagnostic_attempt($1,$2::jsonb) as result", [own.token, JSON.stringify(first)]);
    expect(submitted.rows[0].result.status).toBe("recorded");
    await db.query("select public.submit_diagnostic_attempt($1,$2::jsonb)", [own.token, JSON.stringify(["Replacement", "Replacement"])]);
    const recorded = await db.query<{ response_text: string }>("select response_text from public.diagnostic_responses where answer_id=$1 order by question_index", [own.answerId]);
    expect(recorded.rows.map((row) => row.response_text)).toEqual(first);
  });
});

it("allows only one active grading claim and preserves the submitted rubric", async () => {
  const own = await fixture();
  await asService(async () => {
    await db.query("select public.submit_diagnostic_attempt($1,$2::jsonb)", [own.token, JSON.stringify(["First", "Second"])]);
    await db.query("update public.reteach_packs set diagnostics=$1::jsonb where cluster_id=$2", [JSON.stringify([{ prompt: "New question" }]), own.clusterId]);
    const first = await db.query<{ result: { status: string; questions: unknown[] } }>("select public.claim_diagnostic_grading($1) as result", [own.token]);
    expect(first.rows[0].result.status).toBe("claimed");
    expect(JSON.stringify(first.rows[0].result.questions)).toContain("private-corrected-rubric");
    const second = await db.query<{ result: { status: string } }>("select public.claim_diagnostic_grading($1) as result", [own.token]);
    expect(second.rows[0].result.status).toBe("busy");
  });
});

it("enforces per-principal AI budgets without counting denied requests", async () => {
  await asService(async () => {
    const principal = `user:${randomUUID()}`;
    for (let i = 0; i < 3; i += 1) {
      const allowed = await db.query<{ allowed: boolean }>("select * from public.authorize_ai_request('run',$1)", [principal]);
      expect(allowed.rows[0].allowed).toBe(true);
    }
    const denied = await db.query<{ allowed: boolean; reason: string; retry_after_seconds: number }>("select * from public.authorize_ai_request('run',$1)", [principal]);
    expect(denied.rows[0].allowed).toBe(false);
    expect(denied.rows[0].reason).toBe("principal_limit");
    expect(denied.rows[0].retry_after_seconds).toBeGreaterThan(0);
    const usage = await db.query<{ request_count: number }>("select request_count from public.ai_budget_usage where principal=$1", [principal]);
    expect(usage.rows[0].request_count).toBe(3);
  });
});

it("fences expired grading workers and rejects incomplete verdicts atomically", async () => {
  const own = await fixture();
  await asService(async () => {
    await db.query("select public.submit_diagnostic_attempt($1,$2::jsonb)", [own.token, JSON.stringify(["First", "Second"])]);
    const claim = async () => (await db.query<{ result: { claimId: string } }>("select public.claim_diagnostic_grading($1) as result", [own.token])).rows[0].result.claimId;
    const oldClaim = await claim();
    await db.query("update public.diagnostic_attempts set claimed_at=now()-interval '6 minutes' where answer_id=$1", [own.answerId]);
    const newClaim = await claim();
    expect(newClaim).not.toBe(oldClaim);
    const verdicts = JSON.stringify([{ verdict: "corrected", rationale: "Explained" }, { verdict: "holds", rationale: "Still believes" }]);
    const complete = async (claimId: string, values: string) => (await db.query<{ result: boolean }>("select public.complete_diagnostic_grading($1,$2,$3::jsonb) as result", [own.token, claimId, values])).rows[0].result;
    expect(await complete(oldClaim, verdicts)).toBe(false);
    await db.query("select public.release_diagnostic_grading($1,$2)", [own.token, oldClaim]);
    expect((await db.query<{ claim_id: string }>("select claim_id from public.diagnostic_attempts where answer_id=$1", [own.answerId])).rows[0].claim_id).toBe(newClaim);
    expect(await complete(newClaim, JSON.stringify([{ verdict: "corrected" }, { rationale: "Missing verdict" }]))).toBe(false);
    expect((await db.query("select verdict from public.diagnostic_responses where answer_id=$1 and verdict is not null", [own.answerId])).rows).toHaveLength(0);
    expect(await complete(newClaim, verdicts)).toBe(true);
    expect((await db.query<{ grading_status: string }>("select grading_status from public.diagnostic_attempts where answer_id=$1", [own.answerId])).rows[0].grading_status).toBe("graded");
    expect(await complete(newClaim, verdicts)).toBe(false);
  });
});

it("saves complete owned batches with distinct row mappings and rolls back failed saves", async () => {
  const ownerId = randomUUID();
  const clusterRef = randomUUID();
  const answerRefs = [randomUUID(), randomUUID()];
  await db.query("insert into auth.users(id) values ($1)", [ownerId]);
  const args = [
    JSON.stringify({ question: "Question", marking_scheme: "Scheme", criteria: [], max_score: 2 }),
    JSON.stringify([{ client_ref: clusterRef, label: "Belief", severity: 3, tone: 1 }]),
    JSON.stringify(answerRefs.map((client_ref) => ({ client_ref, cluster_client_ref: clusterRef, student_ref: "SAME-STUDENT", answer: "Reasoning" }))),
    JSON.stringify([{ cluster_client_ref: clusterRef, lesson: [], diagnostics: [] }]),
    "Prediction", "EEE301", "Circuits",
  ];
  const sql = "select public.persist_run_atomic($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7) as result";
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
  try {
    const saved = await db.query<{ result: { session_id: string; cluster_rows: { id: string; client_ref: string }[]; answer_rows: { id: string; client_ref: string; diagnostic_token: string }[] } }>(sql, args);
    const run = saved.rows[0].result;
    expect(run.cluster_rows).toHaveLength(1);
    expect(run.cluster_rows[0].client_ref).toBe(clusterRef);
    expect(run.answer_rows.map((row) => row.client_ref).sort()).toEqual([...answerRefs].sort());
    expect(new Set(run.answer_rows.map((row) => row.id)).size).toBe(2);
    expect(new Set(run.answer_rows.map((row) => row.diagnostic_token)).size).toBe(2);
    expect(run.answer_rows.every((row) => /^[0-9a-f]{32}$/.test(row.diagnostic_token))).toBe(true);
    expect((await db.query<{ status: string; owner_id: string }>("select status,owner_id from public.sessions where id=$1", [run.session_id])).rows[0]).toEqual({ status: "ready", owner_id: ownerId });
    const broken = [...args];
    broken[3] = JSON.stringify([{ cluster_client_ref: randomUUID(), lesson: [], diagnostics: [] }]);
    await expect(db.query(sql, broken)).rejects.toThrow();
    expect((await db.query("select id from public.sessions")).rows).toHaveLength(1);
    expect((await db.query("select id from public.courses")).rows).toHaveLength(1);
    expect((await db.query("select id from public.clusters")).rows).toHaveLength(1);
    expect((await db.query("select id from public.answers")).rows).toHaveLength(2);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await expect(db.query(sql, args)).rejects.toThrow(/Authentication is required/);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
});

it("enforces the global AI budget even when callers create fresh accounts", async () => {
  await db.exec("delete from public.ai_budget_usage where operation='reteach'");
  await asService(async () => {
    await db.query("insert into public.ai_budget_usage(budget_date,operation,principal,request_count) values ((now() at time zone 'UTC')::date,'reteach','test-existing',239)");
    const last = await db.query<{ allowed: boolean }>("select * from public.authorize_ai_request('reteach',$1)", [`user:${randomUUID()}`]);
    expect(last.rows[0].allowed).toBe(true);
    const denied = await db.query<{ allowed: boolean; reason: string }>("select * from public.authorize_ai_request('reteach',$1)", [`user:${randomUUID()}`]);
    expect(denied.rows[0]).toMatchObject({ allowed: false, reason: "global_limit" });
  });
});
