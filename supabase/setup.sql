-- Markwise — complete first-time database setup.
--
-- This is every migration in supabase/migrations/ concatenated in order, for
-- pasting into the Supabase SQL editor in one go on a NEW, EMPTY project.
--
-- It is not a migration itself. The numbered files remain the source of
-- truth; regenerate this with scripts/build-setup-sql.mjs if they change.
--
-- Safe to run once on an empty database. Do NOT run it against a database
-- that already has data: 0004 backfills diagnostic tokens and then marks the
-- column NOT NULL, which is fine on empty tables and fails on partial ones.
--
-- Before running, make sure Authentication -> Sign In / Up -> Anonymous
-- sign-ins is enabled. Every row is owned by an auth.uid(), and a visitor
-- gets an anonymous user on arrival — without it, every insert fails RLS.






/* ================================================================
   0001_init.sql
   ================================================================ */

-- Markwise initial schema
--
-- Ownership model: every row belongs to an auth.users id. Anonymous sign-in
-- produces a real user with a real uid, so an anonymous lecturer and a
-- lecturer who has linked their email are the same shape here — the only
-- difference is whether auth.users.email is null. That is what lets a session
-- survive the upgrade without migrating any data.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

/* ------------------------------------------------------------------ */
/*  Courses — the folder a lecturer's sessions live in                 */
/* ------------------------------------------------------------------ */

create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  code        text not null,
  title       text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists courses_owner_idx on public.courses (owner_id);

/* ------------------------------------------------------------------ */
/*  Sessions — one question per session, per the MVP scope             */
/* ------------------------------------------------------------------ */

create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  course_id      uuid references public.courses (id) on delete set null,
  question       text not null,
  marking_scheme text not null default '',
  criteria       jsonb not null default '[]'::jsonb,
  subject        text,
  level          text,
  max_score      integer not null default 10,
  prediction     text,
  status         text not null default 'draft'
                 check (status in ('draft', 'processing', 'ready')),
  confirmed_at   timestamptz,
  confirmed_by   text,
  created_at     timestamptz not null default now()
);

create index if not exists sessions_owner_idx on public.sessions (owner_id);
create index if not exists sessions_course_idx on public.sessions (course_id);

/* ------------------------------------------------------------------ */
/*  Clusters                                                           */
/* ------------------------------------------------------------------ */

create table if not exists public.clusters (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  label       text not null,
  why         text,
  severity    integer check (severity between 1 and 5),
  downstream  text[] not null default '{}',
  tone        smallint not null default 1,
  is_other    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists clusters_session_idx on public.clusters (session_id);

/* ------------------------------------------------------------------ */
/*  Answers — one row per student answer, carrying both the diagnosis  */
/*  and the provisional score produced by the same extraction call     */
/* ------------------------------------------------------------------ */

create table if not exists public.answers (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions (id) on delete cascade,
  cluster_id        uuid references public.clusters (id) on delete set null,
  student_ref       text not null,
  initials          text,
  answer            text not null,
  is_correct        boolean,
  error_signature   text,
  evidence_span     text,
  confidence        real,
  provisional_score integer,
  criteria_met      text[] not null default '{}',
  criteria_missed   text[] not null default '{}',
  score_rationale   text,
  review_status     text not null default 'unreviewed'
                    check (review_status in ('unreviewed', 'accepted', 'edited', 'flagged')),
  -- Signatures are embedded, never raw answers. 768 dims suits Gemini
  -- text-embedding-004; change to 1536 for OpenAI text-embedding-3-small.
  embedding         vector(768),
  created_at        timestamptz not null default now()
);

create index if not exists answers_session_idx on public.answers (session_id);
create index if not exists answers_cluster_idx on public.answers (cluster_id);

/* ------------------------------------------------------------------ */
/*  Row level security                                                 */
/*                                                                     */
/*  Courses and sessions key straight off owner_id. Clusters and       */
/*  answers inherit through their session, so there is exactly one     */
/*  place ownership is defined.                                        */
/* ------------------------------------------------------------------ */

alter table public.courses  enable row level security;
alter table public.sessions enable row level security;
alter table public.clusters enable row level security;
alter table public.answers  enable row level security;

drop policy if exists "courses are private to their owner" on public.courses;
create policy "courses are private to their owner"
  on public.courses for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "sessions are private to their owner" on public.sessions;
create policy "sessions are private to their owner"
  on public.sessions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "clusters follow their session" on public.clusters;
create policy "clusters follow their session"
  on public.clusters for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = clusters.session_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = clusters.session_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "answers follow their session" on public.answers;
create policy "answers follow their session"
  on public.answers for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = answers.session_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = answers.session_id and s.owner_id = auth.uid()
    )
  );

/* ------------------------------------------------------------------ */
/*  Housekeeping                                                       */
/*                                                                     */
/*  Anonymous sign-in creates a real user per visitor, so abandoned    */
/*  ones accumulate. Run this periodically (pg_cron, or a scheduled    */
/*  function) once the app is live. It only removes anonymous users    */
/*  with no sessions attached, so a lecturer mid-batch is never hit.   */
/* ------------------------------------------------------------------ */

create or replace function public.prune_abandoned_anonymous_users(older_than interval default '7 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - older_than
      and not exists (select 1 from public.sessions s where s.owner_id = u.id)
    returning 1
  )
  select count(*) into removed from doomed;
  return removed;
end;
$$;

revoke all on function public.prune_abandoned_anonymous_users(interval) from public, anon, authenticated;


/* ================================================================
   0002_reteach_packs.sql
   ================================================================ */

-- Reteach packs — PRD §6 step 6.
--
-- Packs are generated per cluster on demand rather than during the run, so a
-- lecturer who only wants the diagnosis never waits for lessons they will not
-- read. Caching them here means a second visit to the reteach screen is free
-- and, more importantly, that the pack a lecturer read is the pack they can
-- come back to — regeneration would quietly hand them different words.

create table if not exists public.reteach_packs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  cluster_id  uuid not null references public.clusters (id) on delete cascade,
  lesson      jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  -- One pack per cluster. A regenerate overwrites rather than accumulating
  -- versions the UI would then have to choose between.
  unique (cluster_id)
);

create index if not exists reteach_packs_session_idx
  on public.reteach_packs (session_id);

alter table public.reteach_packs enable row level security;

drop policy if exists "reteach packs follow their session" on public.reteach_packs;
create policy "reteach packs follow their session"
  on public.reteach_packs for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = reteach_packs.session_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = reteach_packs.session_id and s.owner_id = auth.uid()
    )
  );

/* ------------------------------------------------------------------ */
/*  Run bookkeeping                                                    */
/*                                                                     */
/*  A run can fail halfway. Without somewhere to record that, a session */
/*  stuck in 'processing' is indistinguishable from one still running,  */
/*  and the lecturer is left watching a bar that will never finish.     */
/* ------------------------------------------------------------------ */

alter table public.sessions
  drop constraint if exists sessions_status_check;

alter table public.sessions
  add constraint sessions_status_check
  check (status in ('draft', 'processing', 'ready', 'failed'));

alter table public.sessions
  add column if not exists error text;

alter table public.sessions
  add column if not exists completed_at timestamptz;

-- The lecturer's own display order for clusters survives a merge or split,
-- so the map does not reshuffle under them after a correction.
alter table public.clusters
  add column if not exists rank integer not null default 0;


/* ================================================================
   0003_cluster_positions.sql
   ================================================================ */

-- Cluster positions in embedding space — PRD §7.4.
--
-- The map places related misconceptions near each other, which needs the
-- projected coordinates to survive a reload. Recomputing them on load is not
-- an option: it would mean re-embedding every signature, and a map that moved
-- between two visits to the same run would read as instability in the
-- analysis rather than as the fixed picture it is.
--
-- Nullable because a run can legitimately have nothing to project from — a
-- single cluster, or a batch where nothing grouped.

alter table public.clusters
  add column if not exists plane_x real;

alter table public.clusters
  add column if not exists plane_y real;


/* ================================================================
   0004_diagnostics.sql
   ================================================================ */

-- The measured half of the learning loop — PRD v2 §5 steps 7 and 8.
--
-- A student opens an unguessable link, sees only their own misconception and
-- its two diagnostic questions, answers them, and the result feeds a
-- before/after prevalence figure for the lecturer.
--
-- The privacy rule in §5 step 7 — "never expose another student's answer or
-- identity" — is enforced here rather than in the interface. A student has no
-- account and therefore no auth.uid(), so row level security cannot express
-- "your own row" for them. Two SECURITY DEFINER functions do it instead: each
-- takes a token, and each returns or writes exactly one answer's worth of
-- data. There is no code path from a token to anybody else's work.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ */
/*  The token that addresses one student's diagnostic                  */
/* ------------------------------------------------------------------ */

alter table public.answers
  add column if not exists diagnostic_token text;

-- 128 bits from a CSPRNG. The token is the only credential protecting a
-- student's diagnosis, so it has to be unguessable rather than merely unique.
update public.answers
   set diagnostic_token = encode(gen_random_bytes(16), 'hex')
 where diagnostic_token is null;

alter table public.answers
  alter column diagnostic_token set default encode(gen_random_bytes(16), 'hex');

alter table public.answers
  alter column diagnostic_token set not null;

create unique index if not exists answers_diagnostic_token_idx
  on public.answers (diagnostic_token);

/* ------------------------------------------------------------------ */
/*  Responses                                                          */
/* ------------------------------------------------------------------ */

create table if not exists public.diagnostic_responses (
  id             uuid primary key default gen_random_uuid(),
  answer_id      uuid not null references public.answers (id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  response_text  text not null,
  -- 'holds' means the student still shows the misconception, 'corrected'
  -- means they do not, 'unclear' means the grader could not tell. Unclear is
  -- a real outcome, not a failure: counting a guess as either would corrupt
  -- the one number this whole loop exists to produce.
  verdict        text check (verdict in ('holds', 'corrected', 'unclear')),
  rationale      text,
  created_at     timestamptz not null default now(),
  unique (answer_id, question_index)
);

create index if not exists diagnostic_responses_answer_idx
  on public.diagnostic_responses (answer_id);

alter table public.diagnostic_responses enable row level security;

-- The lecturer who owns the session reads them; nobody else does. Students
-- write through the function below, never through this policy.
drop policy if exists "diagnostic responses follow their session"
  on public.diagnostic_responses;
create policy "diagnostic responses follow their session"
  on public.diagnostic_responses for all
  using (
    exists (
      select 1
        from public.answers a
        join public.sessions s on s.id = a.session_id
       where a.id = diagnostic_responses.answer_id
         and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.answers a
        join public.sessions s on s.id = a.session_id
       where a.id = diagnostic_responses.answer_id
         and s.owner_id = auth.uid()
    )
  );

/* ------------------------------------------------------------------ */
/*  The student's two operations, and nothing else                     */
/* ------------------------------------------------------------------ */

-- Returns one student's misconception and its pack. Deliberately returns no
-- student identifier, no answer text, and nothing about any other student —
-- a leak here would be a leak to someone with no account at all.
create or replace function public.diagnostic_for_token(token text)
returns table (
  cluster_label text,
  cluster_why   text,
  lesson        jsonb,
  diagnostics   jsonb,
  already_done  boolean
)
language sql
security definer
set search_path = public
as $$
  select
    c.label,
    c.why,
    coalesce(p.lesson, '[]'::jsonb),
    coalesce(p.diagnostics, '[]'::jsonb),
    exists (
      select 1 from public.diagnostic_responses r where r.answer_id = a.id
    )
  from public.answers a
  join public.clusters c on c.id = a.cluster_id
  left join public.reteach_packs p on p.cluster_id = c.id
  where a.diagnostic_token = token
    and a.cluster_id is not null;
$$;

-- Records one answer to one question. Rejects an unknown token, and will not
-- overwrite a submitted response: the before/after figure has to be a record
-- of what happened, not of the last attempt.
create or replace function public.submit_diagnostic_response(
  token          text,
  question_index integer,
  response_text  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select a.id into target
    from public.answers a
   where a.diagnostic_token = token;

  if target is null then
    return false;
  end if;

  insert into public.diagnostic_responses (answer_id, question_index, response_text)
  values (target, question_index, response_text)
  on conflict (answer_id, question_index) do nothing;

  return true;
end;
$$;

-- Students are anonymous, so these are callable by anon. That is safe only
-- because each one is scoped to a single token and returns nothing about
-- anyone else. Do not widen either without revisiting §5 step 7.
revoke all on function public.diagnostic_for_token(text) from public;
revoke all on function public.submit_diagnostic_response(text, integer, text) from public;
grant execute on function public.diagnostic_for_token(text) to anon, authenticated;
grant execute on function public.submit_diagnostic_response(text, integer, text) to anon, authenticated;


/* ================================================================
   0005_diagnostic_verdicts.sql
   ================================================================ */

-- Persisting the grade — completes PRD v2 §5 step 8 for a saved run.
--
-- 0004 records a student's answer the moment it arrives, before grading, so a
-- grader outage cannot cost them work they cannot be asked to repeat. That
-- left the verdict itself with nowhere to go: the lecturer's outcome screen
-- reads from the database, so every response arrived there ungraded and the
-- before/after figure showed the whole class as unclear.
--
-- Grading is a second, separate write for the same reason the insert came
-- first. The student is still anonymous when it happens, so it is scoped to
-- one token like everything else they can reach.

create or replace function public.grade_diagnostic_response(
  token          text,
  question_index integer,
  verdict        text,
  rationale      text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if verdict not in ('holds', 'corrected', 'unclear') then
    return false;
  end if;

  select a.id into target
    from public.answers a
   where a.diagnostic_token = token;

  if target is null then
    return false;
  end if;

  -- Only ever fills a blank. A verdict already recorded is the measurement
  -- that was taken; re-grading it later would let a second pass quietly
  -- rewrite a result the lecturer may already have read and acted on.
  update public.diagnostic_responses r
     set verdict   = grade_diagnostic_response.verdict,
         rationale = grade_diagnostic_response.rationale
   where r.answer_id = target
     and r.question_index = grade_diagnostic_response.question_index
     and r.verdict is null;

  return found;
end;
$$;

revoke all on function public.grade_diagnostic_response(text, integer, text, text)
  from public;
grant execute on function public.grade_diagnostic_response(text, integer, text, text)
  to anon, authenticated;


/* ================================================================
   0006_secure_diagnostics.sql
   ================================================================ */

-- Server-authoritative, immutable diagnostic attempts.
--
-- A token may read only its lesson, prompts and its own recorded result. The
-- browser cannot submit verdicts or a rubric. Submission snapshots the trusted
-- stored rubric and both responses in one transaction; grading is claimed and
-- completed only by the service role.

create table if not exists public.diagnostic_attempts (
  answer_id       uuid primary key references public.answers (id) on delete cascade,
  misconception  text not null check (char_length(misconception) between 1 and 2000),
  questions       jsonb not null check (
                    jsonb_typeof(questions) = 'array'
                    and jsonb_array_length(questions) = 2
                  ),
  grading_status  text not null default 'pending'
                  check (grading_status in ('pending', 'grading', 'graded')),
  claim_id        uuid,
  claimed_at      timestamptz,
  submitted_at    timestamptz not null default now()
);

alter table public.diagnostic_attempts enable row level security;

drop policy if exists "diagnostic attempts follow their session"
  on public.diagnostic_attempts;
create policy "diagnostic attempts follow their session"
  on public.diagnostic_attempts for select to authenticated
  using (
    exists (
      select 1
        from public.answers a
        join public.sessions s on s.id = a.session_id
       where a.id = diagnostic_attempts.answer_id
         and s.owner_id = auth.uid()
    )
  );

-- Preserve complete pre-0006 attempts while moving their marking rubric into
-- an immutable snapshot. A legacy partial attempt remains visible but cannot
-- be silently completed with different text.
insert into public.diagnostic_attempts (
  answer_id,
  misconception,
  questions,
  grading_status,
  submitted_at
)
select
  a.id,
  c.label,
  p.diagnostics,
  case
    when bool_and(r.verdict is not null) then 'graded'
    else 'pending'
  end,
  min(r.created_at)
from public.answers a
join public.clusters c on c.id = a.cluster_id and c.session_id = a.session_id
join public.reteach_packs p on p.cluster_id = c.id and p.session_id = a.session_id
join public.diagnostic_responses r on r.answer_id = a.id
where jsonb_typeof(p.diagnostics) = 'array'
  and jsonb_array_length(p.diagnostics) = 2
group by a.id, c.label, p.diagnostics
having count(*) = 2
   and min(r.question_index) = 0
   and max(r.question_index) = 1
on conflict (answer_id) do nothing;

-- Lecturer reads are allowed through ownership RLS. All student writes go
-- through narrowly scoped functions below.
drop policy if exists "diagnostic responses follow their session"
  on public.diagnostic_responses;
create policy "diagnostic responses follow their session"
  on public.diagnostic_responses for select to authenticated
  using (
    exists (
      select 1
        from public.answers a
        join public.sessions s on s.id = a.session_id
       where a.id = diagnostic_responses.answer_id
         and s.owner_id = auth.uid()
    )
  );

revoke insert, update, delete on public.diagnostic_responses from anon, authenticated;
revoke all on public.diagnostic_attempts from anon, authenticated;
grant select on public.diagnostic_attempts to authenticated;

-- Remove the public write capabilities installed by 0004/0005. The legacy
-- functions remain available only to service_role for backwards compatibility.
revoke all on function public.submit_diagnostic_response(text, integer, text)
  from public, anon, authenticated;
revoke all on function public.grade_diagnostic_response(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_diagnostic_response(text, integer, text)
  to service_role;
grant execute on function public.grade_diagnostic_response(text, integer, text, text)
  to service_role;

drop function if exists public.diagnostic_for_token(text);
create function public.diagnostic_for_token(p_token text)
returns table (
  cluster_label  text,
  cluster_why    text,
  lesson         jsonb,
  questions      jsonb,
  responses      jsonb,
  grading_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(attempt.misconception, c.label),
    coalesce(c.why, ''),
    coalesce(p.lesson, '[]'::jsonb),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('prompt', item.value ->> 'prompt')
          order by item.ordinality
        )
        from jsonb_array_elements(
          coalesce(attempt.questions, p.diagnostics, '[]'::jsonb)
        )
          with ordinality as item(value, ordinality)
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'questionIndex', r.question_index,
            'responseText', r.response_text,
            'verdict', r.verdict,
            'rationale', coalesce(r.rationale, '')
          ) order by r.question_index
        )
        from public.diagnostic_responses r
        where r.answer_id = a.id
      ),
      '[]'::jsonb
    ),
    case
      when attempt.grading_status = 'pending' then 'ungraded'
      when attempt.grading_status is not null then attempt.grading_status
      when exists (
        select 1 from public.diagnostic_responses r where r.answer_id = a.id
      ) then 'ungraded'
      else 'open'
    end
  from public.answers a
  join public.clusters c on c.id = a.cluster_id and c.session_id = a.session_id
  left join public.reteach_packs p on p.cluster_id = c.id and p.session_id = a.session_id
  left join public.diagnostic_attempts attempt on attempt.answer_id = a.id
  where a.diagnostic_token::text = p_token
    and a.cluster_id is not null;
$$;

revoke all on function public.diagnostic_for_token(text) from public;
grant execute on function public.diagnostic_for_token(text) to anon, authenticated;

create or replace function public.submit_diagnostic_attempt(
  p_token text,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  stored_misconception text;
  stored_questions jsonb;
  existing_attempt public.diagnostic_attempts%rowtype;
  existing_responses integer;
  item jsonb;
  item_index integer;
begin
  if p_token is null or char_length(p_token) < 8 or char_length(p_token) > 256 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if jsonb_typeof(p_responses) is distinct from 'array'
     or jsonb_array_length(p_responses) <> 2 then
    return jsonb_build_object('status', 'invalid_responses');
  end if;

  select a.id, c.label, p.diagnostics
    into target_id, stored_misconception, stored_questions
    from public.answers a
    join public.clusters c on c.id = a.cluster_id and c.session_id = a.session_id
    join public.reteach_packs p on p.cluster_id = c.id and p.session_id = a.session_id
   where a.diagnostic_token::text = p_token
     and not c.is_other
   for update of a;

  if target_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into existing_attempt
    from public.diagnostic_attempts
   where answer_id = target_id;
  if found then
    return jsonb_build_object(
      'status',
      case existing_attempt.grading_status
        when 'pending' then 'ungraded'
        else existing_attempt.grading_status
      end
    );
  end if;

  select count(*) into existing_responses
    from public.diagnostic_responses
   where answer_id = target_id;
  if existing_responses <> 0 then
    return jsonb_build_object('status', 'incomplete');
  end if;

  if jsonb_typeof(stored_questions) is distinct from 'array'
     or jsonb_array_length(stored_questions) <> 2
     or exists (
       select 1
       from jsonb_array_elements(stored_questions) q
       where jsonb_typeof(q) <> 'object'
          or coalesce(char_length(btrim(q ->> 'prompt')), 0) not between 1 and 20000
          or coalesce(char_length(btrim(q ->> 'holderAnswers')), 0) not between 1 and 20000
          or coalesce(char_length(btrim(q ->> 'correctedAnswers')), 0) not between 1 and 20000
     ) then
    return jsonb_build_object('status', 'invalid_pack');
  end if;

  for item, item_index in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_responses) with ordinality
  loop
    if jsonb_typeof(item) <> 'string'
       or char_length(btrim(item #>> '{}')) not between 1 and 10000 then
      return jsonb_build_object('status', 'invalid_responses');
    end if;
  end loop;

  insert into public.diagnostic_attempts (
    answer_id, misconception, questions, grading_status
  ) values (
    target_id, stored_misconception, stored_questions, 'pending'
  );

  insert into public.diagnostic_responses (
    answer_id, question_index, response_text
  )
  select target_id, (ordinality - 1)::integer, btrim(value #>> '{}')
    from jsonb_array_elements(p_responses) with ordinality;

  return jsonb_build_object('status', 'recorded');
end;
$$;

revoke all on function public.submit_diagnostic_attempt(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_diagnostic_attempt(text, jsonb) to service_role;

create or replace function public.claim_diagnostic_grading(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.diagnostic_attempts%rowtype;
  response_payload jsonb;
  verdict_payload jsonb;
  new_claim_id uuid;
begin
  select d.* into attempt
    from public.diagnostic_attempts d
    join public.answers a on a.id = d.answer_id
   where a.diagnostic_token::text = p_token
   for update of d;

  if attempt.answer_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select jsonb_agg(to_jsonb(r.response_text) order by r.question_index)
    into response_payload
    from public.diagnostic_responses r
   where r.answer_id = attempt.answer_id;

  if jsonb_array_length(coalesce(response_payload, '[]'::jsonb)) <> 2 then
    return jsonb_build_object('status', 'incomplete');
  end if;

  if attempt.grading_status = 'graded' then
    select jsonb_agg(
      jsonb_build_object('verdict', r.verdict, 'rationale', coalesce(r.rationale, ''))
      order by r.question_index
    ) into verdict_payload
      from public.diagnostic_responses r
     where r.answer_id = attempt.answer_id;
    return jsonb_build_object('status', 'graded', 'verdicts', verdict_payload);
  end if;

  if attempt.grading_status = 'grading'
     and attempt.claimed_at > now() - interval '5 minutes' then
    return jsonb_build_object('status', 'busy');
  end if;

  new_claim_id := gen_random_uuid();
  update public.diagnostic_attempts
     set grading_status = 'grading', claim_id = new_claim_id, claimed_at = now()
   where answer_id = attempt.answer_id;

  return jsonb_build_object(
    'status', 'claimed',
    'claimId', new_claim_id,
    'misconception', attempt.misconception,
    'questions', attempt.questions,
    'responses', response_payload
  );
end;
$$;

revoke all on function public.claim_diagnostic_grading(text)
  from public, anon, authenticated;
grant execute on function public.claim_diagnostic_grading(text) to service_role;

create or replace function public.complete_diagnostic_grading(
  p_token text,
  p_claim_id uuid,
  p_verdicts jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  item jsonb;
  item_index integer;
  changed integer;
  existing_verdict text;
begin
  if jsonb_typeof(p_verdicts) is distinct from 'array'
     or jsonb_array_length(p_verdicts) <> 2 then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_verdicts) verdict
     where jsonb_typeof(verdict) <> 'object'
        or jsonb_typeof(verdict -> 'verdict') is distinct from 'string'
        or coalesce(verdict ->> 'verdict', '') not in ('holds', 'corrected', 'unclear')
        or coalesce(jsonb_typeof(verdict -> 'rationale'), 'null') not in ('string', 'null')
        or char_length(coalesce(verdict ->> 'rationale', '')) > 4000
  ) then
    return false;
  end if;

  select d.answer_id into target_id
    from public.diagnostic_attempts d
    join public.answers a on a.id = d.answer_id
   where a.diagnostic_token::text = p_token
     and d.grading_status = 'grading'
     and d.claim_id = p_claim_id
   for update of d;

  if target_id is null then return false; end if;

  for item, item_index in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_verdicts) with ordinality
  loop
    select verdict into existing_verdict
      from public.diagnostic_responses
     where answer_id = target_id
       and question_index = item_index
     for update;
    get diagnostics changed = row_count;
    if changed <> 1 then
      raise exception 'diagnostic verdict could not be recorded';
    end if;
    if existing_verdict is null then
      update public.diagnostic_responses
         set verdict = item ->> 'verdict',
             rationale = coalesce(item ->> 'rationale', '')
       where answer_id = target_id
         and question_index = item_index;
    end if;
  end loop;

  update public.diagnostic_attempts
     set grading_status = 'graded', claim_id = null, claimed_at = null
   where answer_id = target_id;
  return true;
end;
$$;

revoke all on function public.complete_diagnostic_grading(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_diagnostic_grading(text, uuid, jsonb) to service_role;

create or replace function public.release_diagnostic_grading(
  p_token text,
  p_claim_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.diagnostic_attempts d
     set grading_status = 'pending', claim_id = null, claimed_at = null
    from public.answers a
   where a.id = d.answer_id
     and a.diagnostic_token::text = p_token
     and d.grading_status = 'grading'
     and d.claim_id = p_claim_id
  returning true;
$$;

revoke all on function public.release_diagnostic_grading(text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_diagnostic_grading(text, uuid) to service_role;


/* ================================================================
   0007_atomic_runs.sql
   ================================================================ */

-- Atomic run persistence and relational session boundaries.
--
-- A completed analysis is useful only as one coherent unit. The previous
-- client issued separate course/session/cluster/answer inserts, so any later
-- failure left a ready-looking partial session behind. This migration moves
-- the entire write into one authenticated PostgreSQL transaction and returns
-- explicit client correlation mappings for every generated row and token.

create extension if not exists "pgcrypto";

/* Stable, opaque correlation keys for INSERT mappings. */
alter table public.clusters
  add column if not exists client_ref uuid;
update public.clusters set client_ref = gen_random_uuid() where client_ref is null;
alter table public.clusters
  alter column client_ref set default gen_random_uuid(),
  alter column client_ref set not null;

alter table public.answers
  add column if not exists client_ref uuid;
update public.answers set client_ref = gen_random_uuid() where client_ref is null;
alter table public.answers
  alter column client_ref set default gen_random_uuid(),
  alter column client_ref set not null;

create unique index if not exists clusters_session_client_ref_idx
  on public.clusters (session_id, client_ref);
create unique index if not exists answers_session_client_ref_idx
  on public.answers (session_id, client_ref);

/*
 * Repair legacy cross-session references before enforcing the invariant.
 * Answers remain usable as unclustered review rows; a pack without its own
 * session's cluster has no safe meaning and is removed.
 */
update public.answers a
   set cluster_id = null
 where a.cluster_id is not null
   and not exists (
     select 1
       from public.clusters c
      where c.id = a.cluster_id
        and c.session_id = a.session_id
   );

delete from public.reteach_packs p
 where not exists (
   select 1
     from public.clusters c
    where c.id = p.cluster_id
      and c.session_id = p.session_id
 );

alter table public.clusters
  drop constraint if exists clusters_id_session_id_key;
alter table public.clusters
  add constraint clusters_id_session_id_key unique (id, session_id);

alter table public.answers
  drop constraint if exists answers_cluster_id_fkey;
alter table public.answers
  drop constraint if exists answers_cluster_session_fkey;
alter table public.answers
  add constraint answers_cluster_session_fkey
  foreign key (cluster_id, session_id)
  references public.clusters (id, session_id)
  on update cascade
  on delete set null (cluster_id);

alter table public.reteach_packs
  drop constraint if exists reteach_packs_cluster_id_fkey;
alter table public.reteach_packs
  drop constraint if exists reteach_packs_cluster_session_fkey;
alter table public.reteach_packs
  add constraint reteach_packs_cluster_session_fkey
  foreign key (cluster_id, session_id)
  references public.clusters (id, session_id)
  on update cascade
  on delete cascade;

create or replace function public.persist_run_atomic(
  p_input         jsonb,
  p_clusters      jsonb,
  p_answers       jsonb,
  p_reteach_packs jsonb,
  p_prediction    text,
  p_course_code   text,
  p_course_title  text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id    uuid := auth.uid();
  v_course_id   uuid;
  v_session_id  uuid;
  v_cluster_rows jsonb;
  v_answer_rows  jsonb;
begin
  if v_owner_id is null then
    raise exception 'Authentication is required to save a run'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_clusters, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_reteach_packs, '[]'::jsonb)) <> 'array' then
    raise exception 'Run rows must be JSON arrays' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_course_code, '')), '') is not null then
    insert into public.courses (owner_id, code, title)
    values (
      v_owner_id,
      btrim(p_course_code),
      btrim(coalesce(p_course_title, ''))
    )
    returning id into v_course_id;
  end if;

  insert into public.sessions (
    owner_id,
    course_id,
    question,
    marking_scheme,
    criteria,
    subject,
    level,
    max_score,
    prediction,
    status
  ) values (
    v_owner_id,
    v_course_id,
    coalesce(p_input->>'question', ''),
    coalesce(p_input->>'marking_scheme', ''),
    coalesce(p_input->'criteria', '[]'::jsonb),
    p_input->>'subject',
    p_input->>'level',
    coalesce((p_input->>'max_score')::integer, 10),
    p_prediction,
    'processing'
  )
  returning id into v_session_id;

  insert into public.clusters (
    session_id,
    client_ref,
    label,
    why,
    severity,
    downstream,
    tone,
    is_other,
    rank,
    plane_x,
    plane_y
  )
  select
    v_session_id,
    (item->>'client_ref')::uuid,
    coalesce(item->>'label', ''),
    item->>'why',
    (item->>'severity')::integer,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'downstream', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce((item->>'tone')::smallint, 1),
    coalesce((item->>'is_other')::boolean, false),
    coalesce((item->>'rank')::integer, 0),
    (item->>'plane_x')::real,
    (item->>'plane_y')::real
  from jsonb_array_elements(coalesce(p_clusters, '[]'::jsonb)) item;

  -- A supplied cluster reference must resolve inside this new session. A
  -- missing reference is an error, never an instruction to silently uncluster.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) item
     where nullif(item->>'cluster_client_ref', '') is not null
       and not exists (
         select 1
           from public.clusters c
          where c.session_id = v_session_id
            and c.client_ref = (item->>'cluster_client_ref')::uuid
       )
  ) then
    raise exception 'An answer references a missing cluster'
      using errcode = '23503';
  end if;

  insert into public.answers (
    session_id,
    client_ref,
    cluster_id,
    student_ref,
    initials,
    answer,
    is_correct,
    error_signature,
    evidence_span,
    confidence,
    provisional_score,
    criteria_met,
    criteria_missed,
    score_rationale,
    review_status
  )
  select
    v_session_id,
    (item->>'client_ref')::uuid,
    (
      select c.id
        from public.clusters c
       where c.session_id = v_session_id
         and c.client_ref = (item->>'cluster_client_ref')::uuid
    ),
    coalesce(item->>'student_ref', ''),
    item->>'initials',
    coalesce(item->>'answer', ''),
    (item->>'is_correct')::boolean,
    item->>'error_signature',
    item->>'evidence_span',
    (item->>'confidence')::real,
    (item->>'provisional_score')::integer,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'criteria_met', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'criteria_missed', '[]'::jsonb))),
      '{}'::text[]
    ),
    item->>'score_rationale',
    coalesce(item->>'review_status', 'unreviewed')
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) item;

  insert into public.reteach_packs (session_id, cluster_id, lesson, diagnostics)
  select
    v_session_id,
    (
      select c.id
        from public.clusters c
       where c.session_id = v_session_id
         and c.client_ref = (item->>'cluster_client_ref')::uuid
    ),
    coalesce(item->'lesson', '[]'::jsonb),
    coalesce(item->'diagnostics', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_reteach_packs, '[]'::jsonb)) item;

  update public.sessions
     set status = 'ready',
         completed_at = now(),
         error = null
   where id = v_session_id
     and owner_id = v_owner_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('client_ref', c.client_ref, 'id', c.id)
      order by c.client_ref
    ),
    '[]'::jsonb
  ) into v_cluster_rows
  from public.clusters c
  where c.session_id = v_session_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'client_ref', a.client_ref,
        'id', a.id,
        'diagnostic_token', a.diagnostic_token
      )
      order by a.client_ref
    ),
    '[]'::jsonb
  ) into v_answer_rows
  from public.answers a
  where a.session_id = v_session_id;

  return jsonb_build_object(
    'session_id', v_session_id,
    'cluster_rows', v_cluster_rows,
    'answer_rows', v_answer_rows
  );
end;
$$;

revoke all on function public.persist_run_atomic(jsonb, jsonb, jsonb, jsonb, text, text, text)
  from public, anon;
grant execute on function public.persist_run_atomic(jsonb, jsonb, jsonb, jsonb, text, text, text)
  to authenticated;


/* ================================================================
   0008_ai_budgets.sql
   ================================================================ */

-- Durable, service-only daily budgets for every paid AI entry point.
-- The quota decision and both counter increments happen in one transaction,
-- under a transaction-scoped advisory lock, so parallel server processes and
-- newly-created accounts cannot bypass the service-wide ceiling.

create table if not exists public.ai_budget_usage (
  budget_date   date not null,
  operation     text not null check (operation in ('run', 'reteach', 'diagnostic')),
  principal     text not null,
  request_count integer not null check (request_count > 0),
  updated_at    timestamptz not null default now(),
  primary key (budget_date, operation, principal)
);

alter table public.ai_budget_usage enable row level security;
revoke all on table public.ai_budget_usage from public, anon, authenticated;

create or replace function public.authorize_ai_request(
  p_operation text,
  p_principal text
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  principal_limit integer;
  global_limit integer;
  principal_used integer;
  global_used integer;
  today date := (current_timestamp at time zone 'UTC')::date;
  retry_seconds integer := greatest(
    1,
    extract(epoch from (
      ((current_timestamp at time zone 'UTC')::date + 1)::timestamp
      - (current_timestamp at time zone 'UTC')
    ))::integer
  );
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_principal is null or length(p_principal) < 3 or length(p_principal) > 160 then
    raise exception 'invalid AI budget principal' using errcode = '22023';
  end if;

  select limits.principal_limit, limits.global_limit
    into principal_limit, global_limit
    from (values
      ('run'::text,        3,  60),
      ('reteach'::text,   12, 240),
      ('diagnostic'::text, 2, 600)
    ) as limits(operation, principal_limit, global_limit)
   where limits.operation = p_operation;

  if principal_limit is null then
    raise exception 'invalid AI operation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('markwise-ai-budget:' || today::text, 0));

  select coalesce(sum(request_count), 0)::integer
    into principal_used
    from public.ai_budget_usage
   where budget_date = today
     and operation = p_operation
     and principal = p_principal;

  select coalesce(sum(request_count), 0)::integer
    into global_used
    from public.ai_budget_usage
   where budget_date = today
     and operation = p_operation;

  if principal_used >= principal_limit then
    return query select false, 'principal_limit'::text, retry_seconds;
    return;
  end if;

  if global_used >= global_limit then
    return query select false, 'global_limit'::text, retry_seconds;
    return;
  end if;

  insert into public.ai_budget_usage (
    budget_date,
    operation,
    principal,
    request_count,
    updated_at
  ) values (
    today,
    p_operation,
    p_principal,
    1,
    now()
  )
  on conflict (budget_date, operation, principal) do update
     set request_count = public.ai_budget_usage.request_count + 1,
         updated_at = now();

  return query select true, null::text, 0;
end;
$$;

revoke all on function public.authorize_ai_request(text, text) from public, anon, authenticated;
grant execute on function public.authorize_ai_request(text, text) to service_role;
