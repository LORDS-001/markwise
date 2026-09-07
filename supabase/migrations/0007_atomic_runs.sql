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
