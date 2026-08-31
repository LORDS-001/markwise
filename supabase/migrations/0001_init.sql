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
