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
