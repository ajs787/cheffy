-- Moderation (App Review 1.2): act on reports, take content down, suspend
-- accounts, filter objectionable text, and hide heavily reported content
-- automatically until a moderator reviews it.
--
--   * Posts gain a 'removed' status. Every feed, Discover section, ranking and
--     child row (photos, likes, comments) already shows only 'published' posts
--     to other people, so a removed post disappears everywhere at once. Its
--     author still sees it (with the reason) but can't republish it.
--   * Comments gain hidden_at; a restrictive policy hides them from everyone
--     but their author.
--   * Suspension bans the login (auth.users.banned_until) and takes the
--     account's posts and comments down.
--   * Only moderators (public.moderators) can review; every action is logged.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.posts drop constraint posts_status_check;
alter table public.posts add constraint posts_status_check check (status in ('draft', 'published', 'removed'));
alter table public.posts
  add column removed_at timestamptz,
  add column removed_reason text;

alter table public.comments
  add column hidden_at timestamptz,
  add column hidden_reason text;

alter table public.profiles
  add column suspended_at timestamptz,
  add column suspended_reason text;

create table public.moderators (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on public.moderators from anon, authenticated;

create table public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type  text not null,
  target_id    uuid not null,
  action       text not null,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  constraint moderation_actions_type check (target_type in ('post', 'comment', 'user')),
  constraint moderation_actions_action check (action in (
    'dismiss', 'remove', 'restore', 'suspend', 'unsuspend', 'auto_hide'
  ))
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;

create index reports_post_open_idx on public.reports (target_post_id) where status = 'open';
create index reports_comment_open_idx on public.reports (target_comment_id) where status = 'open';
create index reports_user_open_idx on public.reports (target_user_id) where status = 'open';

insert into public.app_config (key, value) values
  ('moderation.auto_hide_reports', '3')
on conflict (key) do nothing;
-- Optional: a Discord or Slack incoming-webhook URL for new-report alerts,
-- set in the SQL editor (never in the app):
--   insert into public.app_config (key, value) values ('moderation.alert_webhook', '"https://…"')
--   on conflict (key) do update set value = excluded.value;

create function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Posts: only moderation (database-owner code) moves posts in or out of
-- 'removed'; authors can't publish around a takedown.
-- ---------------------------------------------------------------------------
create or replace function public.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Client requests run as 'authenticated'; moderation runs as the owner.
  v_moderating boolean := current_user not in ('authenticated', 'anon');
begin
  new.title := btrim(new.title);

  if tg_op = 'INSERT' and new.status = 'removed' and not v_moderating then
    raise exception 'posts can''t be created as removed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and not v_moderating
     and (old.status = 'removed') is distinct from (new.status = 'removed') then
    raise exception 'this post was removed by Cheffy''s moderators' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and not v_moderating then
    new.removed_at := old.removed_at;
    new.removed_reason := old.removed_reason;
  end if;

  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.published_at is not null then
      new.published_at := old.published_at;
    else
      new.published_at := coalesce(new.published_at, now());
    end if;
  elsif new.status = 'removed' then
    -- Keep the original date so a restored post returns to its place.
    new.published_at := coalesce(old.published_at, new.published_at);
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

-- Comments: authors can edit the body, never the moderation fields.
create function public.comments_protect_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
  end if;
  return new;
end;
$$;

create trigger comments_protect_moderation
  before update on public.comments
  for each row execute function public.comments_protect_moderation();

create policy comments_hide_moderated on public.comments
  as restrictive
  for select to authenticated
  using (hidden_at is null or author_id = (select auth.uid()));

-- Suspended accounts can't post or comment even with a still-valid token.
create policy posts_insert_not_suspended on public.posts
  as restrictive
  for insert to authenticated
  with check (not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.suspended_at is not null
  ));
create policy comments_insert_not_suspended on public.comments
  as restrictive
  for insert to authenticated
  with check (not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.suspended_at is not null
  ));

-- ---------------------------------------------------------------------------
-- Objectionable-text filter. Terms live in a private table so they can be
-- extended without a release; matching is whole-word, case-insensitive and
-- sees through common character swaps (n1gg3r, f@g…).
-- ---------------------------------------------------------------------------
create table public.moderation_terms (
  term text primary key,
  constraint moderation_terms_format check (term ~ '^[a-z]+$')
);
alter table public.moderation_terms enable row level security;
revoke all on public.moderation_terms from anon, authenticated;

-- Severe slurs only; food words that look alarming out of context (e.g.
-- "retard" the dough) are deliberately absent.
insert into public.moderation_terms (term) values
  ('nigger'), ('niggers'), ('nigga'), ('niggas'), ('faggot'), ('faggots'), ('fag'), ('fags'),
  ('kike'), ('kikes'), ('tranny'), ('trannies'), ('wetback'), ('wetbacks')
on conflict do nothing;

create function public.has_blocked_term(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.moderation_terms t
    where translate(lower(coalesce(p_text, '')), '4@310$5!|', 'aaeiossii')
          ~ ('\m' || t.term || '\M')
  );
$$;

create function public.reject_blocked_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- By name, so one function serves tables with different columns.
  v_row jsonb := to_jsonb(new);
  v_text text;
begin
  v_text := concat_ws(' ', v_row ->> 'title', v_row ->> 'review', v_row ->> 'story', v_row ->> 'body',
    v_row ->> 'username', v_row ->> 'display_name', v_row ->> 'bio', v_row ->> 'name', v_row ->> 'description');
  if public.has_blocked_term(v_text) then
    raise exception 'that text isn''t allowed on Cheffy' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger posts_reject_blocked_terms before insert or update of title, review, story on public.posts
  for each row execute function public.reject_blocked_terms();
create trigger comments_reject_blocked_terms before insert or update of body on public.comments
  for each row execute function public.reject_blocked_terms();
create trigger profiles_reject_blocked_terms before insert or update of username, display_name, bio on public.profiles
  for each row execute function public.reject_blocked_terms();
create trigger collections_reject_blocked_terms before insert or update of name, description on public.collections
  for each row execute function public.reject_blocked_terms();
create trigger tags_reject_blocked_terms before insert or update of name on public.tags
  for each row execute function public.reject_blocked_terms();

-- ---------------------------------------------------------------------------
-- New reports: hide heavily reported content and alert moderators.
-- ---------------------------------------------------------------------------
create function public.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold integer := public.config_number('moderation.auto_hide_reports', 3)::integer;
  v_reporters integer;
  v_webhook text;
begin
  if new.target_type = 'post' then
    select count(distinct reporter_id) into v_reporters
    from public.reports where target_post_id = new.target_post_id and status = 'open';
    if v_reporters >= v_threshold then
      update public.posts
        set status = 'removed', removed_at = now(), removed_reason = 'Hidden after several reports, pending review'
        where id = new.target_post_id and status = 'published';
      if found then
        insert into public.moderation_actions (target_type, target_id, action, note)
        values ('post', new.target_post_id, 'auto_hide', v_reporters || ' reports');
      end if;
    end if;
  elsif new.target_type = 'comment' then
    select count(distinct reporter_id) into v_reporters
    from public.reports where target_comment_id = new.target_comment_id and status = 'open';
    if v_reporters >= v_threshold then
      update public.comments
        set hidden_at = now(), hidden_reason = 'Hidden after several reports, pending review'
        where id = new.target_comment_id and hidden_at is null;
      if found then
        insert into public.moderation_actions (target_type, target_id, action, note)
        values ('comment', new.target_comment_id, 'auto_hide', v_reporters || ' reports');
      end if;
    end if;
  end if;

  -- Alert (Discord reads "content", Slack reads "text"). No reporter identity.
  select value #>> '{}' into v_webhook from public.app_config where key = 'moderation.alert_webhook';
  if v_webhook like 'https://%' and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_webhook,
          jsonb_build_object(
            'content', 'New Cheffy report: ' || new.target_type || ' (' || new.reason || '). Review it in Settings → Moderation.',
            'text', 'New Cheffy report: ' || new.target_type || ' (' || new.reason || '). Review it in Settings → Moderation.'
          ),
          '{"Content-Type": "application/json"}'::jsonb;
  end if;
  return null;
end;
$$;

create trigger reports_after_insert after insert on public.reports
  for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------------
-- Review: the open queue and the actions a moderator can take.
-- ---------------------------------------------------------------------------
create function public.moderation_queue()
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
      where r.status = 'open'
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

create function public.moderate(p_target_type text, p_target_id uuid, p_action text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_report_status text;
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
      removed_reason = coalesce(nullif(btrim(p_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id and status <> 'draft';
  elsif p_action = 'restore' and p_target_type = 'post' then
    update public.posts set status = 'published', removed_at = null, removed_reason = null
      where id = p_target_id and status = 'removed';
  elsif p_action = 'remove' and p_target_type = 'comment' then
    update public.comments set hidden_at = now(),
      hidden_reason = coalesce(nullif(btrim(p_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id;
  elsif p_action = 'restore' and p_target_type = 'comment' then
    update public.comments set hidden_at = null, hidden_reason = null where id = p_target_id;
  elsif p_action = 'suspend' then
    v_user := p_target_id;
    if v_user = auth.uid() then
      raise exception 'you can''t suspend yourself' using errcode = '22023';
    end if;
    update public.profiles set suspended_at = now(),
      suspended_reason = coalesce(nullif(btrim(p_note), ''), 'Broke the Community Guidelines')
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

  -- Close the reports about this target.
  v_report_status := case when p_action in ('remove', 'suspend') then 'actioned' else 'dismissed' end;
  if p_action <> 'unsuspend' then
    update public.reports set status = v_report_status
    where status = 'open' and case p_target_type
      when 'post' then target_post_id = p_target_id
      when 'comment' then target_comment_id = p_target_id
      else target_user_id = p_target_id end;
  end if;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note)
  values (auth.uid(), p_target_type, p_target_id, p_action, coalesce(p_note, ''));
end;
$$;

revoke all on function public.is_moderator() from public, anon;
revoke all on function public.has_blocked_term(text) from public, anon, authenticated;
revoke all on function public.reject_blocked_terms() from public, anon, authenticated;
revoke all on function public.reports_after_insert() from public, anon, authenticated;
revoke all on function public.comments_protect_moderation() from public, anon, authenticated;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.moderate(text, uuid, text, text) from public, anon;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.moderate(text, uuid, text, text) to authenticated;
