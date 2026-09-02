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
