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
