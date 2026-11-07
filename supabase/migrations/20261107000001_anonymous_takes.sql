-- Anonymous Takes (v1.5): optional comments shown as "Chef #01" instead of
-- the commenter's profile.
--
-- Why the identity lives off the comment row: any signed-in user can read
-- every column of public.comments (and shipped v1.0 apps select author_id
-- directly), and notifications reach clients through Realtime with actor_id
-- in the payload. Hiding a name in the app would not hide it from the API.
-- So an anonymous comment stores author_id = null and a per-post number
-- (anon_number); who holds that number is kept in anonymous_identities,
-- which no client role can read. Notifications for anonymous actions carry
-- actor_id = null. Only moderators can resolve an identity, through
-- admin_reveal_anonymous_author, which records an audit entry every time.
--
-- Writes go through post_anonymous_take() (anon_number isn't a column
-- clients can insert or update). Named comments keep working exactly as
-- before; v1.0 apps skip comments without an author, so they just don't
-- show anonymous ones.
--
-- Blocks: reach is blocked (no commenting on a blocker's posts, no
-- notifications either way), but anonymous comments are not hidden from
-- readers by blocks — otherwise blocking a suspect and watching "Chef #03"
-- disappear would unmask them.
--
-- Rollout: app_config 'anonymous_takes.mode' is 'off' | 'beta' | 'all'
-- ('beta' = accounts in anonymous_takes_testers). Turning it off stops new
-- anonymous comments; existing ones stay, still anonymous.

-- ---------------------------------------------------------------------------
-- 1. Feature flag
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values ('anonymous_takes.mode', '"off"')
on conflict (key) do nothing;

create table public.anonymous_takes_testers (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.anonymous_takes_testers enable row level security;
revoke all on public.anonymous_takes_testers from public, anon, authenticated;

create function public.anonymous_takes_enabled_for(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select value #>> '{}' from public.app_config where key = 'anonymous_takes.mode'), 'off')
    when 'all' then p_user is not null
    when 'beta' then exists (select 1 from public.anonymous_takes_testers t where t.user_id = p_user)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Posts: the creator's switch (on by default, existing posts included)
-- ---------------------------------------------------------------------------
alter table public.posts add column allow_anonymous_takes boolean not null default true;
grant insert (allow_anonymous_takes), update (allow_anonymous_takes) on public.posts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private identity tables (no client access at all)
-- ---------------------------------------------------------------------------
-- The last number handed out per post. Numbers are never reused, even when
-- an account is deleted.
create table public.anonymous_threads (
  post_id     uuid primary key references public.posts (id) on delete cascade,
  last_number integer not null default 0
);

create table public.anonymous_identities (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  number     integer not null check (number > 0),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  unique (post_id, number)
);
create index anonymous_identities_user_idx on public.anonymous_identities (user_id);

alter table public.anonymous_threads enable row level security;
alter table public.anonymous_identities enable row level security;
revoke all on public.anonymous_threads from public, anon, authenticated;
revoke all on public.anonymous_identities from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comments: an author OR a Chef number, never both
-- ---------------------------------------------------------------------------
alter table public.comments
  alter column author_id drop not null,
  add column anon_number integer,
  add column reply_to_anon_number integer,
  add constraint comments_one_identity check ((author_id is null) = (anon_number is not null)),
  add constraint comments_anon_text_only check (
    anon_number is null or (media_upload_id is null and cardinality(mention_ids) = 0)),
  -- Deleting an account deletes its identities, and with them its anonymous comments.
  add constraint comments_anon_identity_fkey foreign key (post_id, anon_number)
    references public.anonymous_identities (post_id, number) on delete cascade;

create index comments_anon_idx on public.comments (post_id, anon_number, created_at)
  where anon_number is not null;
-- Rate limits count a person's recent comments.
create index comments_author_created_idx on public.comments (author_id, created_at desc);
drop index if exists public.comments_author_idx;

-- Replying to an anonymous chef names their number, not an account.
grant insert (reply_to_anon_number) on public.comments to authenticated;

-- Anonymous actions notify without an actor.
alter table public.notifications alter column actor_id drop not null;

-- ---------------------------------------------------------------------------
-- 5. Private helpers (triggers and moderator functions only)
-- ---------------------------------------------------------------------------
create function public.anonymous_user(p_post uuid, p_number integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.user_id from public.anonymous_identities i where i.post_id = p_post and i.number = p_number;
$$;

-- The real author of any comment.
create function public.comment_author_id(p_comment public.comments)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_comment.author_id, public.anonymous_user(p_comment.post_id, p_comment.anon_number));
$$;

-- "Chef #01" … "Chef #99", then "Chef #100".
create function public.anonymous_name(p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_number is null then null else 'Chef #' || lpad(p_number::text, 2, '0') end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the app may ask (only ever about the viewer themselves)
-- ---------------------------------------------------------------------------
-- Computed field: true for the viewer's own comments, named or anonymous
-- (so they can delete their own Chef comments).
create function public.viewer_owns_comment(c public.comments)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.author_id = auth.uid(), false)
    or (c.anon_number is not null and auth.uid() is not null and exists (
      select 1 from public.anonymous_identities i
      where i.post_id = c.post_id and i.number = c.anon_number and i.user_id = auth.uid()));
$$;

-- Can the viewer post an anonymous take on this post right now? And the
-- name they already have there, if any.
create function public.anonymous_takes_eligible(p_user uuid, p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1
    from public.posts p
    join public.profiles a on a.id = p.author_id
    where p.id = p_post
      and p.status = 'published'
      and p.visibility = 'public'
      and p.allow_anonymous_takes
      and not a.is_private
      and a.suspended_at is null
      and p.author_id <> p_user
      and public.anonymous_takes_enabled_for(p.author_id)
      and public.anonymous_takes_enabled_for(p_user)
      and public.user_can_view_post(p_user, p.id)
  );
$$;

create function public.anonymous_takes_status(p_post uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'available', public.anonymous_takes_enabled_for(auth.uid()),
    'open', p_post is not null and public.anonymous_takes_eligible(auth.uid(), p_post),
    'name', case when p_post is not null then public.anonymous_name((
      select i.number from public.anonymous_identities i
      where i.post_id = p_post and i.user_id = auth.uid())) end
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Replies: who a reply answers (a named person or an anonymous chef)
-- ---------------------------------------------------------------------------
create or replace function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments;
  v_thread uuid;
begin
  if new.anon_number is not null then
    -- Anonymous takes are text only: a photo's storage path and an
    -- @mention's notification would both point back at the author.
    if new.media_upload_id is not null then
      raise exception 'anonymous takes are text only' using errcode = '22023';
    end if;
    new.mention_ids := '{}';
  end if;

  if new.parent_id is null then
    new.reply_to_user_id := null;
    new.reply_to_anon_number := null;
    return new;
  end if;
  select * into v_parent from public.comments where id = new.parent_id;
  if v_parent.id is null or v_parent.post_id <> new.post_id then
    raise exception 'reply must belong to a comment on the same post' using errcode = '23514';
  end if;
  -- Replying to a reply joins the same thread.
  v_thread := coalesce(v_parent.parent_id, v_parent.id);
  new.parent_id := v_thread;
  -- A reply can only be addressed to someone in that thread; otherwise it
  -- answers the comment it was written under.
  if new.reply_to_anon_number is not null then
    new.reply_to_user_id := null;
    if not exists (
      select 1 from public.comments c
      where (c.id = v_thread or c.parent_id = v_thread) and c.anon_number = new.reply_to_anon_number
    ) then
      new.reply_to_user_id := v_parent.author_id;
      new.reply_to_anon_number := v_parent.anon_number;
    end if;
  elsif new.reply_to_user_id is not null and not exists (
    select 1 from public.comments c
    where (c.id = v_thread or c.parent_id = v_thread) and c.author_id = new.reply_to_user_id
  ) then
    new.reply_to_user_id := v_parent.author_id;
    new.reply_to_anon_number := v_parent.anon_number;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Rate limits: an hourly cap on every comment; tighter caps and no
--    repeats for anonymous takes
-- ---------------------------------------------------------------------------
create function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := public.comment_author_id(new);
  v_hour   integer;
begin
  if v_author is null then
    return new;
  end if;
  -- Named and anonymous comments together.
  select count(*) into v_hour from (
    select 1 from public.comments c
    where c.author_id = v_author and c.created_at > now() - interval '1 hour'
    union all
    select 1 from public.anonymous_identities i
    join public.comments c on c.post_id = i.post_id and c.anon_number = i.number
    where i.user_id = v_author and c.created_at > now() - interval '1 hour'
  ) x;
  if v_hour >= public.config_number('comments.hourly_limit', 60) then
    raise exception 'you’re commenting a lot — take a short break and try again' using errcode = '53400';
  end if;

  if new.anon_number is not null then
    if (select count(*) from public.anonymous_identities i
        join public.comments c on c.post_id = i.post_id and c.anon_number = i.number
        where i.user_id = v_author and c.created_at > now() - interval '1 hour')
       >= public.config_number('anonymous_takes.hourly_limit', 20) then
      raise exception 'too many anonymous takes for now — try again later' using errcode = '53400';
    end if;
    if (select count(*) from public.comments c
        where c.post_id = new.post_id and c.anon_number = new.anon_number
          and c.created_at > now() - interval '1 hour')
       >= public.config_number('anonymous_takes.per_post_hourly_limit', 8) then
      raise exception 'that’s a lot of takes on one post — try again later' using errcode = '53400';
    end if;

    -- The same words again on this post within 10 minutes: spam. (A retry
    -- within two minutes never gets here: post_anonymous_take returns the
    -- first one.)
    if exists (
      select 1 from public.comments c
      where c.post_id = new.post_id and c.anon_number = new.anon_number
        and c.created_at > now() - interval '10 minutes'
        and lower(btrim(c.body)) = lower(btrim(new.body))
    ) then
      raise exception 'you already posted that' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- ---------------------------------------------------------------------------
-- 9. Posting and deleting an anonymous take
-- ---------------------------------------------------------------------------
-- Returns the new comment (so the app can select it with the usual embeds).
-- Retrying the same take within two minutes returns the first one.
create function public.post_anonymous_take(
  p_post     uuid,
  p_body     text,
  p_parent   uuid default null,
  p_reply_to uuid default null
)
returns setof public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_number  integer;
  v_target  public.comments;
  v_reply_user uuid;
  v_reply_anon integer;
  v_existing uuid;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.is_suspended() then
    raise exception 'your account is suspended' using errcode = '42501';
  end if;
  if not public.anonymous_takes_eligible(v_uid, p_post) then
    raise exception 'anonymous takes aren’t open on this post' using errcode = '42501';
  end if;

  -- One identity per person per post, handed out one at a time.
  perform pg_advisory_xact_lock(hashtextextended('anonymous_takes:' || p_post::text, 0));
  select i.number into v_number from public.anonymous_identities i
  where i.post_id = p_post and i.user_id = v_uid;

  -- Same take again within two minutes (a retry after a lost response).
  if v_number is not null then
    select c.id into v_existing from public.comments c
    where c.post_id = p_post and c.anon_number = v_number
      and c.parent_id is not distinct from p_parent
      and c.body = btrim(coalesce(p_body, ''))
      and c.created_at > now() - interval '2 minutes'
    order by c.created_at desc limit 1;
    if v_existing is not null then
      return query select * from public.comments c where c.id = v_existing;
      return;
    end if;
  end if;

  if v_number is null then
    insert into public.anonymous_threads as t (post_id, last_number) values (p_post, 1)
    on conflict (post_id) do update set last_number = t.last_number + 1
    returning last_number into v_number;
    insert into public.anonymous_identities (post_id, user_id, number) values (p_post, v_uid, v_number);
  end if;

  -- Who it answers, in the thread (the trigger checks it belongs there).
  if p_reply_to is not null then
    select * into v_target from public.comments c where c.id = p_reply_to and c.post_id = p_post;
    v_reply_user := v_target.author_id;
    v_reply_anon := v_target.anon_number;
  end if;

  insert into public.comments (post_id, author_id, anon_number, body, parent_id, reply_to_user_id, reply_to_anon_number)
  values (p_post, null, v_number, btrim(coalesce(p_body, '')), p_parent, v_reply_user, v_reply_anon)
  returning id into v_id;

  return query select * from public.comments c where c.id = v_id;
end;
$$;

create function public.delete_anonymous_take(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.comments c
  using public.anonymous_identities i
  where c.id = p_comment
    and c.anon_number is not null
    and i.post_id = c.post_id and i.number = c.anon_number
    and i.user_id = auth.uid();
  if not found then
    raise exception 'comment not found' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Notifications: anonymous actions carry no actor
-- ---------------------------------------------------------------------------
-- Same rules as notify() — checked against the real author — but stored
-- without them, so neither the row nor its Realtime payload names anyone.
create function public.notify_anonymously(
  p_recipient uuid, p_actor uuid, p_type text, p_post uuid, p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor
     or public.is_blocked_between(p_recipient, p_actor) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  values (p_recipient, null, p_type, p_post, p_comment);
end;
$$;

create or replace function public.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := public.comment_author_id(new);
  v_recipient uuid;
  v_type      text;
  v_parent    public.comments;
begin
  if new.parent_id is null then
    select author_id into v_recipient from public.posts where id = new.post_id;
    v_type := 'comment';
  else
    select * into v_parent from public.comments where id = new.parent_id;
    v_recipient := coalesce(new.reply_to_user_id,
                            public.anonymous_user(new.post_id, new.reply_to_anon_number),
                            public.comment_author_id(v_parent));
    v_type := 'comment_reply';
  end if;
  if new.anon_number is not null then
    perform public.notify_anonymously(v_recipient, v_actor, v_type, new.post_id, new.id);
  else
    perform public.notify(v_recipient, v_actor, v_type, new.post_id, new.id);
  end if;
  return null;
end;
$$;

create or replace function public.comment_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment public.comments;
begin
  if tg_op = 'INSERT' then
    select * into v_comment from public.comments where id = new.comment_id;
    perform public.notify(public.comment_author_id(v_comment), new.user_id, 'comment_like', v_comment.post_id, new.comment_id);
  else
    select * into v_comment from public.comments where id = old.comment_id;
    perform public.unnotify(public.comment_author_id(v_comment), old.user_id, 'comment_like', v_comment.post_id, old.comment_id);
  end if;
  return null;
end;
$$;

-- Push text: "Chef #03 commented on …" when there's no actor.
create or replace function public.push_message(p_notification public.notifications)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_title text;
  v_text text;
begin
  if p_notification.actor_id is null then
    select public.anonymous_name(c.anon_number) into v_actor from public.comments c where c.id = p_notification.comment_id;
  else
    select username into v_actor from public.profiles where id = p_notification.actor_id;
  end if;
  select title into v_title from public.posts where id = p_notification.post_id;
  v_text := case p_notification.type
    when 'follow' then 'started following you'
    when 'follow_request' then 'asked to follow you'
    when 'follow_accepted' then 'accepted your follow request'
    when 'post_like' then 'liked your ' || coalesce(v_title, 'post')
    when 'comment' then 'commented on ' || coalesce(v_title, 'your post')
    when 'comment_reply' then 'replied to you on ' || coalesce(v_title, 'a post')
    when 'comment_like' then 'liked your comment on ' || coalesce(v_title, 'a post')
    when 'collab_invite' then 'invited you to co-post ' || coalesce(v_title, 'a creation')
    when 'collab_accepted' then 'is now co-creator of ' || coalesce(v_title, 'your creation')
    when 'comment_mention' then 'mentioned you in a comment on ' || coalesce(v_title, 'a post')
  end;
  return jsonb_build_object(
    'title', 'Cheffy',
    'body', coalesce(v_actor, 'Someone') || ' ' || v_text,
    'sound', 'default',
    'data', jsonb_strip_nulls(jsonb_build_object(
      'notificationId', p_notification.id,
      'commentId', p_notification.comment_id,
      'path', case when p_notification.post_id is not null
        then '/post/' || p_notification.post_id
        when p_notification.actor_id is not null
        then '/user/' || p_notification.actor_id end
    ))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Reports: new reasons; anonymous comments reported without exposing
--     the author (the report keeps the owner privately for moderators)
-- ---------------------------------------------------------------------------
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in (
  'spam', 'inappropriate', 'harassment', 'hate', 'threats', 'not_homemade', 'intellectual_property', 'other'));

create or replace function public.report_priority(p_reason text, p_reporters bigint, p_hidden boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_reason in ('harassment', 'inappropriate', 'hate', 'threats') or p_reporters >= 2 or coalesce(p_hidden, false) then 'urgent'
    when p_reason in ('spam', 'not_homemade') then 'low'
    else 'normal'
  end;
$$;

create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anon integer;
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
    select public.comment_author_id(c), c.anon_number,
           jsonb_strip_nulls(jsonb_build_object(
             'body', c.body, 'post_id', c.post_id,
             'anonymous_name', public.anonymous_name(c.anon_number),
             'mentions', (select jsonb_agg(m.username) from public.comment_mentions m where m.comment_id = c.id),
             'media', case when c.media_path is not null then jsonb_build_object(
               'kind', c.media_kind, 'path', c.media_path, 'thumb', c.media_thumb_path,
               'width', c.media_width, 'height', c.media_height) end))
      into new.target_owner_id, v_anon, new.target_snapshot
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
  -- An anonymous author's username is only shown after a recorded reveal.
  if v_anon is null then
    new.target_snapshot := new.target_snapshot || jsonb_build_object(
      'owner_username', (select username from public.profiles where id = new.target_owner_id));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Moderation
-- ---------------------------------------------------------------------------
alter table public.moderation_actions drop constraint moderation_actions_action;
alter table public.moderation_actions add constraint moderation_actions_action check (action in (
  'dismiss', 'remove', 'restore', 'suspend', 'unsuspend', 'auto_hide', 'review', 'resolve', 'reopen',
  'note', 'remove_media', 'restore_media', 'reveal_identity'));

-- Is this report about an anonymous comment?
create function public.report_is_anonymous(p_report public.reports)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_report.target_type = 'comment' and (
    p_report.target_snapshot ? 'anonymous_name'
    or exists (select 1 from public.comments c where c.id = p_report.target_comment_id and c.anon_number is not null));
$$;

create function public.report_identity_revealed(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderation_actions a
                 where a.report_id = p_report and a.action = 'reveal_identity');
$$;

-- Moderators only: who wrote an anonymous comment, with a required reason.
-- Every call is recorded in the report's moderation history.
create function public.admin_reveal_anonymous_author(p_report uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
  v_reason text := left(btrim(coalesce(p_reason, '')), 2000);
begin
  perform public.assert_moderator();
  select * into v_r from public.reports where id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if not public.report_is_anonymous(v_r) then
    raise exception 'this report isn’t about an anonymous comment' using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'say why you need to see who wrote it' using errcode = '22023';
  end if;
  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id)
  values (auth.uid(), 'comment', coalesce(v_r.target_comment_id, v_r.target_owner_id), 'reveal_identity', v_reason, v_r.id);
  return public.admin_report_author(v_r.target_owner_id);
end;
$$;

-- The account panel for a report (shared by detail and reveal).
create function public.admin_report_author(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', pr.id, 'username', pr.username, 'display_name', pr.display_name,
           'joined', pr.created_at, 'suspended', pr.suspended_at is not null,
           'posts', (select count(*) from public.posts p where p.author_id = pr.id and p.status = 'published'),
           'removed_posts', (select count(*) from public.posts p where p.author_id = pr.id and p.status = 'removed'),
           'reports_against', (select count(*) from public.reports x where x.target_owner_id = pr.id),
           'recent_reports', coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'target_type', x.target_type, 'reason', x.reason,
                                                 'status', x.status, 'created_at', x.created_at,
                                                 'anonymous', public.report_is_anonymous(x))
                              order by x.created_at desc)
             from (select * from public.reports x where x.target_owner_id = pr.id
                   order by x.created_at desc limit 20) x), '[]'::jsonb))
  from public.profiles pr where pr.id = p_user;
$$;

-- Report detail: an anonymous comment's author stays hidden until revealed.
create or replace function public.admin_report_detail(p_report uuid)
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
  v_anon boolean;
begin
  perform public.assert_moderator();
  select * into v_r from public.reports where id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  v_tid := public.report_target_id(v_r);
  v_anon := public.report_is_anonymous(v_r);

  if v_r.target_type = 'post' then
    select jsonb_build_object(
             'exists', true, 'title', p.title, 'review', p.review, 'story', p.story,
             'status', p.status, 'visibility', p.visibility, 'removed_reason', p.removed_reason,
             'published_at', p.published_at,
             'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'thumb', i.thumb_path) order by i.position)
                                 from public.post_images i where i.post_id = p.id), '[]'::jsonb))
      into v_current from public.posts p where p.id = v_tid;
  elsif v_r.target_type = 'comment' then
    select jsonb_strip_nulls(jsonb_build_object(
             'exists', true, 'body', c.body, 'hidden', c.hidden_at is not null,
             'hidden_reason', c.hidden_reason, 'post_id', c.post_id,
             'post_title', (select p.title from public.posts p where p.id = c.post_id),
             'anonymous_name', public.anonymous_name(c.anon_number),
             'mentions', (select jsonb_agg(m.username) from public.comment_mentions m where m.comment_id = c.id),
             'media', case when c.media_path is not null then jsonb_build_object(
               'kind', c.media_kind, 'path', c.media_path, 'thumb', c.media_thumb_path,
               'width', c.media_width, 'height', c.media_height,
               'hidden', c.media_hidden_at is not null, 'hidden_reason', c.media_hidden_reason) end,
             -- The thread around it: its parent and up to 10 neighbours, as the public sees them.
             'thread', (select jsonb_agg(jsonb_build_object(
                          'id', t.id, 'body', t.body, 'created_at', t.created_at,
                          'name', coalesce(public.anonymous_name(t.anon_number),
                                           '@' || (select pr.username from public.profiles pr where pr.id = t.author_id)),
                          'is_reported', t.id = c.id) order by t.created_at)
                        from (select * from public.comments t
                              where t.id = coalesce(c.parent_id, c.id) or t.parent_id = coalesce(c.parent_id, c.id)
                              order by abs(extract(epoch from t.created_at - c.created_at)) limit 11) t)))
      into v_current from public.comments c where c.id = v_tid;
  else
    select jsonb_build_object(
             'exists', true, 'username', pr.username, 'display_name', pr.display_name, 'bio', pr.bio,
             'avatar_path', pr.avatar_path, 'suspended', pr.suspended_at is not null,
             'suspended_reason', pr.suspended_reason)
      into v_current from public.profiles pr where pr.id = v_tid;
  end if;

  if not v_anon or public.report_identity_revealed(v_r.id) then
    v_author := public.admin_report_author(v_r.target_owner_id);
  end if;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_r.id, 'target_type', v_r.target_type, 'target_id', v_tid, 'reason', v_r.reason,
      'details', v_r.details, 'status', v_r.status, 'created_at', v_r.created_at,
      'reviewed_at', v_r.reviewed_at, 'resolution_note', v_r.resolution_note,
      'reviewed_by', (select pr.username from public.profiles pr where pr.id = v_r.reviewed_by),
      'updated_at', v_r.updated_at,
      'anonymous', v_anon,
      'identity_revealed', v_anon and public.report_identity_revealed(v_r.id),
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

-- Report list: anonymous authors are listed by their Chef name and can't be
-- searched by username.
create or replace function public.admin_reports(
  p_status text default 'active', p_type text default null, p_reason text default null,
  p_priority text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, target_type text, target_id uuid, reason text, status text, priority text,
              created_at timestamptz, reviewed_at timestamptz, preview text, owner_username text,
              target_reports bigint, is_hidden boolean, overdue boolean)
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
             coalesce(pt.reporters, 0) as reporters, coalesce(pt.on_target, 1) as on_target,
             public.report_is_anonymous(rep) as anon
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
             case when r.anon
               then coalesce(r.target_snapshot ->> 'anonymous_name', 'Anonymous chef') || ' (anonymous)'
               else coalesce(r.target_snapshot ->> 'owner_username', r.target_snapshot ->> 'username',
                             (select pr.username from public.profiles pr where pr.id = r.target_owner_id))
             end as owner,
             r.anon
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
           or (not s.anon and s.owner ilike '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
    order by (public.report_priority(s.reason, s.reporters, s.hidden) = 'urgent') desc,
             s.created_at asc, s.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Suspending the author of a reported post or comment (for an anonymous
-- comment, only after the identity was revealed on this report).
create or replace function public.admin_moderate_report(p_report uuid, p_action text, p_expected text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
begin
  perform public.assert_moderator();
  if p_action not in ('remove', 'restore', 'suspend', 'unsuspend', 'suspend_author') then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_r.status is distinct from p_expected then
    raise exception 'this report was changed by someone else (now %); reload it', v_r.status using errcode = '40001';
  end if;

  perform set_config('cheffy.moderation_report', p_report::text, true);
  if p_action = 'suspend_author' then
    if v_r.target_type not in ('post', 'comment') or v_r.target_owner_id is null then
      raise exception 'no author to suspend' using errcode = '22023';
    end if;
    if public.report_is_anonymous(v_r) and not public.report_identity_revealed(v_r.id) then
      raise exception 'reveal who wrote it first (that step is recorded)' using errcode = '42501';
    end if;
    perform public.moderate('user', v_r.target_owner_id, 'suspend', coalesce(p_note, ''));
    update public.reports
      set status = 'actioned', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
          resolution_note = case when btrim(coalesce(p_note, '')) <> '' then p_note else resolution_note end
      where id = v_r.id;
  else
    if public.report_target_id(v_r) is null then
      raise exception 'the reported content no longer exists' using errcode = 'P0002';
    end if;
    perform public.moderate(v_r.target_type, public.report_target_id(v_r), p_action, coalesce(p_note, ''));
  end if;
  perform set_config('cheffy.moderation_report', '', true);
end;
$$;

-- Suspending an account also hides its anonymous comments (and unsuspending
-- brings them back), same as its named ones.
create function public.moderation_hide_anonymous(p_user uuid, p_hide boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.comments c
     set hidden_at = case when p_hide then now() end,
         hidden_reason = case when p_hide then 'Account suspended' end
    from public.anonymous_identities i
   where i.user_id = p_user and c.post_id = i.post_id and c.anon_number = i.number
     and case when p_hide then c.hidden_at is null else c.hidden_reason = 'Account suspended' end;
$$;

create function public.moderation_after_suspend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.suspended_at is not null and old.suspended_at is null then
    perform public.moderation_hide_anonymous(new.id, true);
  elsif new.suspended_at is null and old.suspended_at is not null then
    perform public.moderation_hide_anonymous(new.id, false);
  end if;
  return null;
end;
$$;

create trigger profiles_suspension_anonymous
  after update of suspended_at on public.profiles
  for each row execute function public.moderation_after_suspend();

-- ---------------------------------------------------------------------------
-- 13. Creating and editing posts: the switch goes through save_post
-- ---------------------------------------------------------------------------
create or replace function public.save_post(p_post jsonb, p_images jsonb DEFAULT '[]'::jsonb, p_tags text[] DEFAULT '{}'::text[], p_categories uuid[] DEFAULT NULL::uuid[], p_custom jsonb DEFAULT NULL::jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_row   public.posts := jsonb_populate_record(null::public.posts, p_post);
  v_found boolean;
  v_tags  text[];
  v_cats  uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_row.id is null then
    raise exception 'post id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_images, '[]'::jsonb)) > 6 then
    raise exception 'a post can have at most 6 images' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) e
    where nullif(e ->> 'id', '') is null
  ) then
    raise exception 'every image needs an id' using errcode = '22023';
  end if;
  if v_row.made_on is not null and v_row.made_on > current_date + 1 then
    raise exception 'made_on cannot be in the future' using errcode = '22023';
  end if;

  -- Classifications: the full ordered list, or (older clients) the single
  -- columns. The single columns keep each kind's first pick.
  v_cats := coalesce(
    p_categories,
    array_remove(array[v_row.subcategory_id, v_row.cuisine_id, v_row.dish_type_id], null)
  );
  -- Custom labels ("Other / Add custom"): resolved to a category, reusing
  -- any existing one with the same normalized name.
  if p_custom is not null then
    if jsonb_typeof(p_custom) <> 'array' or jsonb_array_length(p_custom) > 6 then
      raise exception 'at most 6 custom classifications' using errcode = '22023';
    end if;
    v_cats := v_cats || coalesce((
      select array_agg(public.ensure_custom_category(
        e ->> 'kind',
        case when e ->> 'kind' = 'subcategory' then v_row.primary_category_id end,
        e ->> 'label'
      ))
      from jsonb_array_elements(p_custom) e
    ), '{}');
  end if;
  select coalesce(array_agg(id order by ord), '{}') into v_cats
  from (
    select distinct on (c) c as id, ord
    from unnest(v_cats) with ordinality as t(c, ord)
    order by c, ord
  ) d;
  if array_length(v_cats, 1) > 12 then
    raise exception 'a post can have at most 12 classifications' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_cats) c
    where not exists (
      select 1 from public.categories k
      where k.id = c and k.kind in ('subcategory', 'cuisine', 'dish_type')
    )
  ) then
    raise exception 'classifications must be subcategories, cuisines or dish types' using errcode = '23514';
  end if;

  -- With a list, the single columns become each kind's first pick. Older
  -- clients' columns are kept as sent, so the posts trigger validates them.
  if p_categories is not null then
    select
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'subcategory' order by o limit 1),
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'cuisine' order by o limit 1),
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'dish_type' order by o limit 1)
    into v_row.subcategory_id, v_row.cuisine_id, v_row.dish_type_id;
  end if;

  select true into v_found from public.posts where id = v_row.id;

  if coalesce(v_found, false) then
    update public.posts set
      title               = v_row.title,
      primary_category_id = v_row.primary_category_id,
      subcategory_id      = v_row.subcategory_id,
      cuisine_id          = v_row.cuisine_id,
      meal_type_id        = v_row.meal_type_id,
      dish_type_id        = v_row.dish_type_id,
      rating              = v_row.rating,
      review              = coalesce(v_row.review, ''),
      story               = coalesce(v_row.story, ''),
      visibility          = coalesce(v_row.visibility, 'public'),
      status              = coalesce(v_row.status, 'published'),
      made_on             = coalesce(v_row.made_on, current_date),
      would_make_again    = v_row.would_make_again,
      recipe_url          = nullif(btrim(v_row.recipe_url), ''),
      ingredients         = coalesce(v_row.ingredients, ''),
      prep_notes          = coalesce(v_row.prep_notes, ''),
      next_time_notes     = coalesce(v_row.next_time_notes, ''),
      cook_time_minutes   = v_row.cook_time_minutes,
      temperature         = v_row.temperature,
      milk                = nullif(btrim(v_row.milk), ''),
      sweetener           = nullif(btrim(v_row.sweetener), ''),
      -- Only when the client sends them: older app versions don't know
      -- about Budget Eats and must not erase it when editing a post.
      is_budget           = case when p_post ? 'is_budget' then coalesce(v_row.is_budget, false) else is_budget end,
      budget_cost_cents   = case when p_post ? 'is_budget'
                                 then case when coalesce(v_row.is_budget, false) then v_row.budget_cost_cents end
                                 else budget_cost_cents end,
      -- Anonymous Takes: only when sent, so older app versions keep it.
      allow_anonymous_takes = case when p_post ? 'allow_anonymous_takes'
                                   then coalesce(v_row.allow_anonymous_takes, true) else allow_anonymous_takes end
    where id = v_row.id and author_id = v_uid;

    if not found then
      raise exception 'post not found' using errcode = '42501';
    end if;
  else
    insert into public.posts (
      id, author_id, title, primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id,
      rating, review, story, visibility, status, made_on, would_make_again, recipe_url, ingredients,
      prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener,
      is_budget, budget_cost_cents, allow_anonymous_takes
    ) values (
      v_row.id, v_uid, v_row.title, v_row.primary_category_id, v_row.subcategory_id, v_row.cuisine_id,
      v_row.meal_type_id, v_row.dish_type_id, v_row.rating, coalesce(v_row.review, ''), coalesce(v_row.story, ''),
      coalesce(v_row.visibility, 'public'), coalesce(v_row.status, 'published'),
      coalesce(v_row.made_on, current_date), v_row.would_make_again, nullif(btrim(v_row.recipe_url), ''),
      coalesce(v_row.ingredients, ''), coalesce(v_row.prep_notes, ''), coalesce(v_row.next_time_notes, ''),
      v_row.cook_time_minutes, v_row.temperature, nullif(btrim(v_row.milk), ''), nullif(btrim(v_row.sweetener), ''),
      coalesce(v_row.is_budget, false),
      case when coalesce(v_row.is_budget, false) then v_row.budget_cost_cents end,
      coalesce(v_row.allow_anonymous_takes, true)
    );
  end if;

  -- Images: drop removed ones, then upsert the rest in display order.
  delete from public.post_images pi
  where pi.post_id = v_row.id
    and pi.id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) e
    );

  insert into public.post_images (id, post_id, storage_path, thumb_path, width, height, position)
  select (e ->> 'id')::uuid, v_row.id, e ->> 'storage_path', e ->> 'thumb_path',
         (e ->> 'width')::integer, (e ->> 'height')::integer, (ord - 1)::smallint
  from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) with ordinality as t(e, ord)
  on conflict (id) do update set position = excluded.position
  where public.post_images.post_id = v_row.id;

  -- Classifications: drop removed ones, then upsert in order.
  delete from public.post_categories pc
  where pc.post_id = v_row.id and pc.category_id <> all (v_cats);

  insert into public.post_categories (post_id, category_id, position)
  select v_row.id, c, (ord - 1)::smallint
  from unnest(v_cats) with ordinality as t(c, ord)
  on conflict (post_id, category_id) do update set position = excluded.position;

  -- Tags: normalize, dedupe, cap at 10.
  select coalesce(array_agg(distinct s), '{}') into v_tags
  from (
    select public.slugify(t) as s from unnest(coalesce(p_tags, '{}')) t
  ) x
  where char_length(s) between 1 and 30;

  if array_length(v_tags, 1) > 10 then
    raise exception 'a post can have at most 10 tags' using errcode = '22023';
  end if;

  insert into public.tags (slug, name, created_by)
  select s, replace(s, '-', ' '), v_uid from unnest(v_tags) s
  on conflict (slug) do nothing;

  delete from public.post_tags pt
  where pt.post_id = v_row.id
    and pt.tag_id not in (select t.id from public.tags t where t.slug = any (v_tags));

  insert into public.post_tags (post_id, tag_id)
  select v_row.id, t.id from public.tags t where t.slug = any (v_tags)
  on conflict do nothing;

  return v_row.id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 14. Privileges: private helpers stay private
-- ---------------------------------------------------------------------------
revoke all on function public.anonymous_takes_enabled_for(uuid) from public, anon, authenticated;
revoke all on function public.anonymous_user(uuid, integer) from public, anon, authenticated;
revoke all on function public.comment_author_id(public.comments) from public, anon, authenticated;
revoke all on function public.anonymous_takes_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.comments_rate_limit() from public, anon, authenticated;
revoke all on function public.notify_anonymously(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.report_is_anonymous(public.reports) from public, anon, authenticated;
revoke all on function public.report_identity_revealed(uuid) from public, anon, authenticated;
revoke all on function public.admin_report_author(uuid) from public, anon, authenticated;
revoke all on function public.moderation_hide_anonymous(uuid, boolean) from public, anon, authenticated;
revoke all on function public.moderation_after_suspend() from public, anon, authenticated;

revoke all on function public.anonymous_name(integer) from public, anon;
revoke all on function public.viewer_owns_comment(public.comments) from public, anon;
revoke all on function public.anonymous_takes_status(uuid) from public, anon;
revoke all on function public.post_anonymous_take(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.delete_anonymous_take(uuid) from public, anon;
revoke all on function public.admin_reveal_anonymous_author(uuid, text) from public, anon;
grant execute on function public.anonymous_name(integer) to authenticated;
grant execute on function public.viewer_owns_comment(public.comments) to authenticated;
grant execute on function public.anonymous_takes_status(uuid) to authenticated;
grant execute on function public.post_anonymous_take(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.delete_anonymous_take(uuid) to authenticated;
-- Checks assert_moderator() itself.
grant execute on function public.admin_reveal_anonymous_author(uuid, text) to authenticated;
