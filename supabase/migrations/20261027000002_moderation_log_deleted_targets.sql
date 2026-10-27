-- Reviewing, resolving or noting a report whose post, comment or account was
-- deleted failed: the report's target columns are cleared on delete, and the
-- log row's target_id was NOT NULL. Such rows are now logged against the
-- report alone. Every row must still point at its content or its report.
-- No data changes; existing rows all have a target_id.

alter table public.moderation_actions alter column target_id drop not null;

alter table public.moderation_actions
  add constraint moderation_actions_has_subject check (target_id is not null or report_id is not null);
