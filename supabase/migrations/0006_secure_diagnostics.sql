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
