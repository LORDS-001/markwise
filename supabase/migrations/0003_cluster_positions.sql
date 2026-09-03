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
