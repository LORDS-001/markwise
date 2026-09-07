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
