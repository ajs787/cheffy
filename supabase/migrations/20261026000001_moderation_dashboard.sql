-- Moderation dashboard (web, cheffy.me/admin/moderation/): per-report review,
-- evidence, priorities, an append-only audit trail and new-report alerts.
--
-- Report statuses keep their stored values; the dashboard shows them as
--   open → Pending, reviewed → Under review, actioned → Resolved, dismissed.
--
-- Every function here is SECURITY DEFINER and checks public.is_moderator()
-- first: the dashboard uses the ordinary publishable key and a moderator's
-- own sign-in, never a service-role key. public.moderators has no client
-- grants, so nobody can make themselves a moderator.

-- ---------------------------------------------------------------------------
-- Reports: who reviewed, when, with what note; evidence kept at report time.
-- ---------------------------------------------------------------------------
alter table public.reports
  add column reviewed_by     uuid references public.profiles (id) on delete set null,
  add column reviewed_at     timestamptz,
  add column resolution_note text not null default '',
  add column updated_at      timestamptz not null default now(),
  -- The content as it was when reported (text and photo paths), so deleting
  -- or editing it afterwards doesn't erase the evidence.
  add column target_snapshot jsonb not null default '{}'::jsonb,
  add column target_owner_id uuid,
  add column alerted_at      timestamptz,
  add constraint reports_resolution_note_length check (char_length(resolution_note) <= 2000);

-- A report names exactly the target its type says.
alter table public.reports add constraint reports_target_matches_type check (
  case target_type
    when 'post' then target_user_id is null and target_comment_id is null
    when 'comment' then target_user_id is null and target_post_id is null
    else target_post_id is null and target_comment_id is null
  end
) not valid;
alter table public.reports validate constraint reports_target_matches_type;

-- One active report per person per target; reporting again is a no-op.
create unique index reports_one_active_per_reporter on public.reports (
  reporter_id, target_type, coalesce(target_post_id, target_comment_id, target_user_id)
) where status in ('open', 'reviewed') and reporter_id is not null;

create index reports_owner_idx on public.reports (target_owner_id);

-- Reporters may only ever set the report itself; review fields are moderator-only
-- (column grants on insert already exclude them, this covers future grants).
create function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'open';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.resolution_note := '';
  new.alerted_at := null;
  new.created_at := now();
  new.updated_at := now();

  if new.target_type = 'post' then
    select p.author_id,
           jsonb_build_object(
             'title', p.title, 'review', p.review, 'story', p.story,
             'visibility', p.visibility, 'status', p.status,
             'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'thumb', i.thumb_path) order by i.position)
                                 from public.post_images i where i.post_id = p.id), '[]'::jsonb))
      into new.target_owner_id, new.target_snapshot
      from public.posts p where p.id = new.target_post_id;
  elsif new.target_type = 'comment' then
    select c.author_id, jsonb_build_object('body', c.body, 'post_id', c.post_id)
      into new.target_owner_id, new.target_snapshot
      from public.comments c where c.id = new.target_comment_id;
  else
    select pr.id, jsonb_build_object('username', pr.username, 'display_name', pr.display_name,
                                     'bio', pr.bio, 'avatar_path', pr.avatar_path)
      into new.target_owner_id, new.target_snapshot
      from public.profiles pr where pr.id = new.target_user_id;
  end if;
  if new.target_owner_id is null then
    raise exception 'that content no longer exists' using errcode = 'P0002';
  end if;
  new.target_snapshot := new.target_snapshot || jsonb_build_object(
    'owner_username', (select username from public.profiles where id = new.target_owner_id));
  return new;
end;
$$;

-- Named to run after reports_validate_target (BEFORE triggers fire by name).
create trigger reports_with_evidence before insert on public.reports
  for each row execute function public.reports_before_insert();

-- The privacy policy promises that deleting an account removes its posts and
-- comments, so the evidence copied from that account goes with it.
create function public.reports_scrub_deleted_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports
    set target_snapshot = jsonb_build_object('scrubbed', true, 'note', 'Author deleted their account'),
        target_owner_id = null,
        updated_at = now()
    where target_owner_id = old.id;
  return old;
end;
$$;

create trigger profiles_scrub_report_evidence before delete on public.profiles
  for each row execute function public.reports_scrub_deleted_owner();

-- ---------------------------------------------------------------------------
-- Audit trail: append-only. The only change allowed is the moderator column
-- going to null when that moderator deletes their account.
-- ---------------------------------------------------------------------------
alter table public.moderation_actions
  add column report_id uuid references public.reports (id) on delete set null,
  add column from_status text,
  add column to_status text;

alter table public.moderation_actions drop constraint moderation_actions_action;
alter table public.moderation_actions add constraint moderation_actions_action check (action in (
  'dismiss', 'remove', 'restore', 'suspend', 'unsuspend', 'auto_hide',
  'review', 'resolve', 'reopen', 'note'
));
alter table public.moderation_actions add constraint moderation_actions_note_length
  check (char_length(note) <= 2000) not valid;
create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at);

create function public.moderation_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'the moderation log can''t be changed' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'moderator_id' - 'report_id') is distinct from (to_jsonb(old) - 'moderator_id' - 'report_id')
     or (new.moderator_id is not null and new.moderator_id is distinct from old.moderator_id)
     or (new.report_id is not null and new.report_id is distinct from old.report_id) then
    raise exception 'the moderation log can''t be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger moderation_actions_append_only before update or delete on public.moderation_actions
  for each row execute function public.moderation_actions_append_only();

-- ---------------------------------------------------------------------------
-- Moderators can see the photos of anything they review (including removed
-- or private posts); everyone else's access is unchanged.
-- ---------------------------------------------------------------------------
create policy post_images_objects_select_moderators on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images' and public.is_moderator());

-- ---------------------------------------------------------------------------
-- Priority (documented in MODERATION_ADMIN_GUIDE.md):
--   urgent  harassment or inappropriate content, reported by 2+ people, or
--           already auto-hidden
--   low     spam or "not homemade" from a single reporter
--   normal  everything else
-- ---------------------------------------------------------------------------
create function public.report_priority(p_reason text, p_reporters bigint, p_hidden boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_reason in ('harassment', 'inappropriate') or p_reporters >= 2 or coalesce(p_hidden, false) then 'urgent'
    when p_reason in ('spam', 'not_homemade') then 'low'
    else 'normal'
  end;
$$;

-- Target key for grouping the reports about one thing.
create function public.report_target_id(r public.reports)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(r.target_post_id, r.target_comment_id, r.target_user_id);
$$;

-- Is the reported content currently taken down?
create function public.report_target_hidden(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'post' then (select p.status = 'removed' from public.posts p where p.id = p_id)
    when 'comment' then (select c.hidden_at is not null from public.comments c where c.id = p_id)
    else (select pr.suspended_at is not null from public.profiles pr where pr.id = p_id)
  end;
$$;

create function public.assert_moderator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'moderators only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard reads
-- ---------------------------------------------------------------------------
create function public.admin_report_counts()
returns table (pending bigint, urgent bigint, overdue bigint, under_review bigint, resolved bigint, dismissed bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_moderator();
  return query
    with per_target as (
      select rep.target_type, public.report_target_id(rep) as tid,
             count(distinct rep.reporter_id) filter (where rep.status in ('open', 'reviewed')) as reporters
      from public.reports rep
      group by 1, 2
    ),
    r as (
      select rep.*, coalesce(pt.reporters, 0) as reporters
      from public.reports rep
      left join per_target pt on pt.target_type = rep.target_type and pt.tid = public.report_target_id(rep)
    )
    select count(*) filter (where r.status = 'open'),
           count(*) filter (where r.status in ('open', 'reviewed')
             and public.report_priority(r.reason, r.reporters,
                   public.report_target_hidden(r.target_type, coalesce(r.target_post_id, r.target_comment_id, r.target_user_id))) = 'urgent'),
           count(*) filter (where r.status in ('open', 'reviewed') and r.created_at < now() - interval '24 hours'),
           count(*) filter (where r.status = 'reviewed'),
           count(*) filter (where r.status = 'actioned'),
           count(*) filter (where r.status = 'dismissed')
    from r;
end;
$$;

create function public.admin_reports(
  p_status   text default 'active',
  p_type     text default null,
  p_reason   text default null,
  p_priority text default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_search   text default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  id             uuid,
  target_type    text,
  target_id      uuid,
  reason         text,
  status         text,
  priority       text,
  created_at     timestamptz,
  reviewed_at    timestamptz,
  preview        text,
  owner_username text,
  target_reports bigint,
  is_hidden      boolean,
  overdue        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_moderator();
  return query
    with per_target as (
      select rep.target_type, public.report_target_id(rep) as tid,
             count(distinct rep.reporter_id) filter (where rep.status in ('open', 'reviewed')) as reporters,
             count(*) as on_target
      from public.reports rep
      group by 1, 2
    ),
    r as (
      select rep.*, public.report_target_id(rep) as tid,
             coalesce(pt.reporters, 0) as reporters, coalesce(pt.on_target, 1) as on_target
      from public.reports rep
      left join per_target pt on pt.target_type = rep.target_type and pt.tid = public.report_target_id(rep)
    ),
    shaped as (
      select r.id, r.target_type, r.tid, r.reason, r.status, r.created_at, r.reviewed_at, r.on_target,
             public.report_target_hidden(r.target_type, r.tid) as hidden,
             r.reporters,
             coalesce(
               r.target_snapshot ->> 'title',
               r.target_snapshot ->> 'body',
               nullif(concat_ws(' — ', r.target_snapshot ->> 'display_name', nullif(r.target_snapshot ->> 'bio', '')), ''),
               r.target_snapshot ->> 'note',
               ''
             ) as preview,
             coalesce(r.target_snapshot ->> 'owner_username', r.target_snapshot ->> 'username',
                      (select pr.username from public.profiles pr where pr.id = r.target_owner_id)) as owner
      from r
    )
    select s.id, s.target_type, s.tid, s.reason, s.status,
           public.report_priority(s.reason, s.reporters, s.hidden),
           s.created_at, s.reviewed_at, left(s.preview, 280), s.owner, s.on_target, coalesce(s.hidden, false),
           s.status in ('open', 'reviewed') and s.created_at < now() - interval '24 hours'
    from shaped s
    where (p_status is null or p_status = 'all'
           or (p_status = 'active' and s.status in ('open', 'reviewed'))
           or s.status = p_status)
      and (p_type is null or s.target_type = p_type)
      and (p_reason is null or s.reason = p_reason)
      and (p_priority is null or public.report_priority(s.reason, s.reporters, s.hidden) = p_priority)
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
      and (v_search is null
           or s.id::text like lower(v_search) || '%'
           or s.preview ilike '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or s.owner ilike '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    -- Urgent first, then oldest first, so nothing waits behind newer reports.
    order by (public.report_priority(s.reason, s.reporters, s.hidden) = 'urgent') desc,
             s.created_at asc, s.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One report in full: the evidence, the content as it is now, the other
-- reports about the same target (never who filed them) and the history.
create function public.admin_report_detail(p_report uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
  v_tid uuid;
  v_current jsonb;
  v_author jsonb;
begin
  perform public.assert_moderator();
  select * into v_r from public.reports where id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  v_tid := public.report_target_id(v_r);

  if v_r.target_type = 'post' then
    select jsonb_build_object(
             'exists', true, 'title', p.title, 'review', p.review, 'story', p.story,
             'status', p.status, 'visibility', p.visibility, 'removed_reason', p.removed_reason,
             'published_at', p.published_at,
             'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'thumb', i.thumb_path) order by i.position)
                                 from public.post_images i where i.post_id = p.id), '[]'::jsonb))
      into v_current from public.posts p where p.id = v_tid;
  elsif v_r.target_type = 'comment' then
    select jsonb_build_object(
             'exists', true, 'body', c.body, 'hidden', c.hidden_at is not null,
             'hidden_reason', c.hidden_reason, 'post_id', c.post_id,
             'post_title', (select p.title from public.posts p where p.id = c.post_id))
      into v_current from public.comments c where c.id = v_tid;
  else
    select jsonb_build_object(
             'exists', true, 'username', pr.username, 'display_name', pr.display_name, 'bio', pr.bio,
             'avatar_path', pr.avatar_path, 'suspended', pr.suspended_at is not null,
             'suspended_reason', pr.suspended_reason)
      into v_current from public.profiles pr where pr.id = v_tid;
  end if;

  select jsonb_build_object(
           'id', pr.id, 'username', pr.username, 'display_name', pr.display_name,
           'joined', pr.created_at, 'suspended', pr.suspended_at is not null,
           'posts', (select count(*) from public.posts p where p.author_id = pr.id and p.status = 'published'),
           'removed_posts', (select count(*) from public.posts p where p.author_id = pr.id and p.status = 'removed'),
           'reports_against', (select count(*) from public.reports x where x.target_owner_id = pr.id))
    into v_author from public.profiles pr where pr.id = v_r.target_owner_id;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_r.id, 'target_type', v_r.target_type, 'target_id', v_tid, 'reason', v_r.reason,
      'details', v_r.details, 'status', v_r.status, 'created_at', v_r.created_at,
      'reviewed_at', v_r.reviewed_at, 'resolution_note', v_r.resolution_note,
      'reviewed_by', (select pr.username from public.profiles pr where pr.id = v_r.reviewed_by),
      'updated_at', v_r.updated_at,
      'priority', public.report_priority(v_r.reason,
        (select count(distinct x.reporter_id) from public.reports x
          where x.target_type = v_r.target_type and public.report_target_id(x) = v_tid and x.status in ('open', 'reviewed')),
        public.report_target_hidden(v_r.target_type, v_tid))),
    'snapshot', v_r.target_snapshot,
    'current', coalesce(v_current, jsonb_build_object('exists', false)),
    'author', v_author,
    'related', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason, 'details', x.details,
                                          'status', x.status, 'created_at', x.created_at) order by x.created_at)
      from public.reports x
      where x.target_type = v_r.target_type and public.report_target_id(x) = v_tid and x.id <> v_r.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', a.action, 'note', a.note, 'created_at', a.created_at,
               'from_status', a.from_status, 'to_status', a.to_status, 'report_id', a.report_id,
               'moderator', coalesce((select pr.username from public.profiles pr where pr.id = a.moderator_id),
                                     case when a.action = 'auto_hide' then 'automatic' else 'former moderator' end))
             order by a.created_at)
      from public.moderation_actions a
      where a.report_id = v_r.id or (a.target_type = v_r.target_type and a.target_id = v_tid)), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard writes. Each takes the status the moderator saw: if another
-- moderator changed the report meanwhile, it fails instead of overwriting;
-- repeating the same change is a no-op.
-- ---------------------------------------------------------------------------
create function public.admin_set_report_status(
  p_report   uuid,
  p_status   text,
  p_expected text,
  p_note     text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_note text := left(btrim(coalesce(p_note, '')), 2000);
begin
  perform public.assert_moderator();
  if p_status not in ('open', 'reviewed', 'actioned', 'dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select status into v_current from public.reports where id = p_report for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_current = p_status then
    return v_current;
  end if;
  if v_current is distinct from p_expected then
    raise exception 'this report was changed by someone else (now %); reload it', v_current using errcode = '40001';
  end if;
  if p_status = 'open' and v_current in ('actioned', 'dismissed') and v_note = '' then
    raise exception 'add a note saying why the report is reopened' using errcode = '22023';
  end if;

  update public.reports
    set status = p_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        resolution_note = case when v_note <> '' then v_note else resolution_note end,
        updated_at = now()
    where id = p_report;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id, from_status, to_status)
  select auth.uid(), r.target_type, coalesce(r.target_post_id, r.target_comment_id, r.target_user_id),
         case p_status when 'reviewed' then 'review' when 'actioned' then 'resolve'
                       when 'dismissed' then 'dismiss' else 'reopen' end,
         v_note, r.id, v_current, p_status
  from public.reports r where r.id = p_report;

  return p_status;
end;
$$;

create function public.admin_add_report_note(p_report uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := left(btrim(coalesce(p_note, '')), 2000);
begin
  perform public.assert_moderator();
  if v_note = '' then
    raise exception 'the note is empty' using errcode = '22023';
  end if;
  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id)
  select auth.uid(), r.target_type, coalesce(r.target_post_id, r.target_comment_id, r.target_user_id), 'note', v_note, r.id
  from public.reports r where r.id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Take content down (or bring it back) from a report. Uses public.moderate,
-- so it behaves exactly like the in-app moderation screen; the log row is
-- tied to this report.
create function public.admin_moderate_report(
  p_report   uuid,
  p_action   text,
  p_expected text,
  p_note     text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
begin
  perform public.assert_moderator();
  if p_action not in ('remove', 'restore', 'suspend', 'unsuspend') then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_r.status is distinct from p_expected then
    raise exception 'this report was changed by someone else (now %); reload it', v_r.status using errcode = '40001';
  end if;
  if public.report_target_id(v_r) is null then
    raise exception 'the reported content no longer exists' using errcode = 'P0002';
  end if;

  perform set_config('cheffy.moderation_report', p_report::text, true);
  perform public.moderate(v_r.target_type, public.report_target_id(v_r), p_action, coalesce(p_note, ''));
  perform set_config('cheffy.moderation_report', '', true);
end;
$$;

-- public.moderate: also closes reports under review, records who reviewed
-- them, and ties its log row to the report when called from the dashboard.
create or replace function public.moderate(p_target_type text, p_target_id uuid, p_action text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_report_status text;
  v_report uuid := nullif(current_setting('cheffy.moderation_report', true), '')::uuid;
  v_note text := left(coalesce(p_note, ''), 2000);
begin
  if not public.is_moderator() then
    raise exception 'moderators only' using errcode = '42501';
  end if;
  if not (
    (p_target_type in ('post', 'comment') and p_action in ('dismiss', 'remove', 'restore'))
    or (p_target_type = 'user' and p_action in ('dismiss', 'suspend', 'unsuspend'))
  ) then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;

  if p_action = 'remove' and p_target_type = 'post' then
    update public.posts set status = 'removed', removed_at = now(),
      removed_reason = coalesce(nullif(btrim(v_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id and status <> 'draft';
  elsif p_action = 'restore' and p_target_type = 'post' then
    update public.posts set status = 'published', removed_at = null, removed_reason = null
      where id = p_target_id and status = 'removed';
  elsif p_action = 'remove' and p_target_type = 'comment' then
    update public.comments set hidden_at = now(),
      hidden_reason = coalesce(nullif(btrim(v_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id;
  elsif p_action = 'restore' and p_target_type = 'comment' then
    update public.comments set hidden_at = null, hidden_reason = null where id = p_target_id;
  elsif p_action = 'suspend' then
    v_user := p_target_id;
    if v_user = auth.uid() then
      raise exception 'you can''t suspend yourself' using errcode = '22023';
    end if;
    if exists (select 1 from public.moderators m where m.user_id = v_user) then
      raise exception 'moderators can''t be suspended here' using errcode = '22023';
    end if;
    update public.profiles set suspended_at = now(),
      suspended_reason = coalesce(nullif(btrim(v_note), ''), 'Broke the Community Guidelines')
      where id = v_user;
    update auth.users set banned_until = 'infinity' where id = v_user;
    update public.posts set status = 'removed', removed_at = now(), removed_reason = 'Account suspended'
      where author_id = v_user and status = 'published';
    update public.comments set hidden_at = now(), hidden_reason = 'Account suspended'
      where author_id = v_user and hidden_at is null;
  elsif p_action = 'unsuspend' then
    v_user := p_target_id;
    update public.profiles set suspended_at = null, suspended_reason = null where id = v_user;
    update auth.users set banned_until = null where id = v_user;
    update public.posts set status = 'published', removed_at = null, removed_reason = null
      where author_id = v_user and status = 'removed' and removed_reason = 'Account suspended';
    update public.comments set hidden_at = null, hidden_reason = null
      where author_id = v_user and hidden_reason = 'Account suspended';
  end if;

  -- Close the active reports about this target.
  v_report_status := case when p_action in ('remove', 'suspend') then 'actioned' else 'dismissed' end;
  if p_action not in ('unsuspend', 'restore') then
    update public.reports
      set status = v_report_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
          resolution_note = case when btrim(v_note) <> '' then v_note else resolution_note end
    where status in ('open', 'reviewed') and case p_target_type
      when 'post' then target_post_id = p_target_id
      when 'comment' then target_comment_id = p_target_id
      else target_user_id = p_target_id end;
  end if;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id, to_status)
  values (auth.uid(), p_target_type, p_target_id, p_action, v_note, v_report,
          case when p_action in ('unsuspend', 'restore') then null else v_report_status end);
end;
$$;

-- ---------------------------------------------------------------------------
-- New-report alerts. Besides the optional Discord/Slack webhook, an email
-- alert can be sent through the moderation-alert Edge Function (no report
-- details in the email). Configure in the SQL editor, never in the app:
--   insert into public.app_config (key, value) values
--     ('moderation.alert_function_url', '"https://<ref>.supabase.co/functions/v1/moderation-alert"'),
--     ('moderation.alert_function_auth', '"<publishable or anon key>"'),
--     ('moderation.alert_secret', '"<same value as the function''s MODERATION_ALERT_SECRET>"')
--   on conflict (key) do update set value = excluded.value;
-- Delivery is asynchronous (pg_net): a failed alert never blocks or loses a
-- report, and the dashboard queue stays the source of truth.
-- ---------------------------------------------------------------------------
create or replace function public.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold integer := public.config_number('moderation.auto_hide_reports', 3)::integer;
  v_reporters integer;
  v_webhook text;
  v_fn_url text;
  v_fn_auth text;
  v_secret text;
  v_has_net boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post');
begin
  if new.target_type = 'post' then
    select count(distinct reporter_id) into v_reporters
    from public.reports where target_post_id = new.target_post_id and status in ('open', 'reviewed');
    if v_reporters >= v_threshold then
      update public.posts
        set status = 'removed', removed_at = now(), removed_reason = 'Hidden after several reports, pending review'
        where id = new.target_post_id and status = 'published';
      if found then
        insert into public.moderation_actions (target_type, target_id, action, note, report_id)
        values ('post', new.target_post_id, 'auto_hide', v_reporters || ' reports', new.id);
      end if;
    end if;
  elsif new.target_type = 'comment' then
    select count(distinct reporter_id) into v_reporters
    from public.reports where target_comment_id = new.target_comment_id and status in ('open', 'reviewed');
    if v_reporters >= v_threshold then
      update public.comments
        set hidden_at = now(), hidden_reason = 'Hidden after several reports, pending review'
        where id = new.target_comment_id and hidden_at is null;
      if found then
        insert into public.moderation_actions (target_type, target_id, action, note, report_id)
        values ('comment', new.target_comment_id, 'auto_hide', v_reporters || ' reports', new.id);
      end if;
    end if;
  end if;

  if not v_has_net then
    return null;
  end if;

  -- Chat webhook (Discord reads "content", Slack reads "text"). No reporter identity.
  select value #>> '{}' into v_webhook from public.app_config where key = 'moderation.alert_webhook';
  if v_webhook like 'https://%' then
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_webhook,
          jsonb_build_object(
            'content', 'New Cheffy report to review: ' || new.target_type || ' (' || new.reason || '). https://cheffy.me/admin/moderation/',
            'text', 'New Cheffy report to review: ' || new.target_type || ' (' || new.reason || '). https://cheffy.me/admin/moderation/'
          ),
          '{"Content-Type": "application/json"}'::jsonb;
  end if;

  -- Email through the Edge Function (one call per report; the function
  -- claims alerted_at so a retry never sends twice).
  select value #>> '{}' into v_fn_url from public.app_config where key = 'moderation.alert_function_url';
  select value #>> '{}' into v_fn_auth from public.app_config where key = 'moderation.alert_function_auth';
  select value #>> '{}' into v_secret from public.app_config where key = 'moderation.alert_secret';
  if v_fn_url like 'https://%' and coalesce(v_secret, '') <> '' then
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_fn_url,
          jsonb_build_object('report_id', new.id),
          jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(v_fn_auth, ''),
            'apikey', coalesce(v_fn_auth, ''),
            'x-cheffy-alert-secret', v_secret);
  end if;
  return null;
end;
$$;

-- Used by the moderation-alert Edge Function (service role only): claim the
-- report for alerting and get the counts for the email.
create function public.claim_report_alert(p_report uuid)
returns table (claimed boolean, pending bigint, urgent bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  update public.reports set alerted_at = now()
    where id = p_report and alerted_at is null
    returning true into v_claimed;
  return query
    select coalesce(v_claimed, false),
           (select count(*) from public.reports r where r.status = 'open'),
           (select count(*) from public.reports r where r.status in ('open', 'reviewed')
              and r.reason in ('harassment', 'inappropriate'));
end;
$$;

create function public.release_report_alert(p_report uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reports set alerted_at = null where id = p_report;
$$;

create function public.moderator_emails()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text from public.moderators m join auth.users u on u.id = m.user_id
  where u.email is not null;
$$;

-- The in-app moderation screen also lists reports someone is reviewing.
create or replace function public.moderation_queue()
returns table (
  target_type   text,
  target_id     uuid,
  report_count  bigint,
  reasons       text[],
  details       text[],
  first_reported timestamptz,
  preview       text,
  owner_id      uuid,
  owner_username text,
  is_hidden     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_moderator() then
    raise exception 'moderators only' using errcode = '42501';
  end if;
  return query
    with open_reports as (
      select r.target_type,
             coalesce(r.target_post_id, r.target_comment_id, r.target_user_id) as target_id,
             r.reason, r.details, r.created_at
      from public.reports r
      where r.status in ('open', 'reviewed')
        and coalesce(r.target_post_id, r.target_comment_id, r.target_user_id) is not null
    )
    select o.target_type, o.target_id, count(*),
           array_agg(distinct o.reason), array_remove(array_agg(nullif(o.details, '')), null),
           min(o.created_at),
           case o.target_type
             when 'post' then (select p.title || coalesce(' — ' || nullif(p.review, ''), '') from public.posts p where p.id = o.target_id)
             when 'comment' then (select c.body from public.comments c where c.id = o.target_id)
             else (select pr.display_name || coalesce(' — ' || nullif(pr.bio, ''), '') from public.profiles pr where pr.id = o.target_id)
           end,
           case o.target_type
             when 'post' then (select p.author_id from public.posts p where p.id = o.target_id)
             when 'comment' then (select c.author_id from public.comments c where c.id = o.target_id)
             else o.target_id
           end,
           (select pr.username from public.profiles pr where pr.id = case o.target_type
             when 'post' then (select p.author_id from public.posts p where p.id = o.target_id)
             when 'comment' then (select c.author_id from public.comments c where c.id = o.target_id)
             else o.target_id end),
           case o.target_type
             when 'post' then (select p.status = 'removed' from public.posts p where p.id = o.target_id)
             when 'comment' then (select c.hidden_at is not null from public.comments c where c.id = o.target_id)
             else (select pr.suspended_at is not null from public.profiles pr where pr.id = o.target_id)
           end
    from open_reports o
    group by o.target_type, o.target_id
    order by min(o.created_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.reports_before_insert() from public, anon, authenticated;
revoke all on function public.reports_scrub_deleted_owner() from public, anon, authenticated;
revoke all on function public.moderation_actions_append_only() from public, anon, authenticated;
revoke all on function public.report_priority(text, bigint, boolean) from public, anon;
revoke all on function public.report_target_id(public.reports) from public, anon;
revoke all on function public.report_target_hidden(text, uuid) from public, anon, authenticated;
revoke all on function public.assert_moderator() from public, anon, authenticated;
revoke all on function public.admin_report_counts() from public, anon;
revoke all on function public.admin_reports(text, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
revoke all on function public.admin_report_detail(uuid) from public, anon;
revoke all on function public.admin_set_report_status(uuid, text, text, text) from public, anon;
revoke all on function public.admin_add_report_note(uuid, text) from public, anon;
revoke all on function public.admin_moderate_report(uuid, text, text, text) from public, anon;
revoke all on function public.claim_report_alert(uuid) from public, anon, authenticated;
revoke all on function public.release_report_alert(uuid) from public, anon, authenticated;
revoke all on function public.moderator_emails() from public, anon, authenticated;

grant execute on function public.report_priority(text, bigint, boolean) to authenticated;
grant execute on function public.report_target_id(public.reports) to authenticated;
grant execute on function public.admin_report_counts() to authenticated;
grant execute on function public.admin_reports(text, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;
grant execute on function public.admin_report_detail(uuid) to authenticated;
grant execute on function public.admin_set_report_status(uuid, text, text, text) to authenticated;
grant execute on function public.admin_add_report_note(uuid, text) to authenticated;
grant execute on function public.admin_moderate_report(uuid, text, text, text) to authenticated;
grant execute on function public.claim_report_alert(uuid) to service_role;
grant execute on function public.release_report_alert(uuid) to service_role;
grant execute on function public.moderator_emails() to service_role;
