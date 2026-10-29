-- Comments with @mentions, one photo or sticker each.
--
-- Mentions
--   The body keeps the readable "@username" text. The client also sends the
--   ids it picked (mention_ids); a trigger keeps only ids whose *current*
--   username really appears in the body, so nobody can tag a user the text
--   doesn't name. The kept mentions are stored by user id in
--   comment_mentions with the username as written, so the app can still
--   link "@oldname" to the right person after they rename.
--   Notifications: one per mentioned person per comment, never yourself,
--   never someone in a block with you, only people who can see the post,
--   and only when their "Who can @mention you" setting allows. Spam limits
--   cap the notifications (the mention itself still links).
--
-- Photos and stickers
--   Clients can't write to the comment-media bucket at all. The
--   comment-media Edge Function receives the file, checks its real bytes
--   (JPEG/PNG/WebP signature, header dimensions, size), stores it with the
--   service role and records it in comment_uploads. A comment then points at
--   that upload; a trigger checks it's the author's own, unused and fresh,
--   and copies its metadata, so a comment can't name arbitrary paths or
--   external URLs, and no image bytes ever live in Postgres.
--   Reading follows the comment: a file is signable only by its owner,
--   moderators, or someone who can see a comment using it (comment RLS
--   already covers deleted posts, post visibility, blocks and moderation).
--   Uploads that never became a comment (or whose comment was deleted) are
--   swept by the Edge Function after an hour, unless a report holds them.

-- ---------------------------------------------------------------------------
-- Helpers (internal: used by triggers that run as the database owner)
-- ---------------------------------------------------------------------------

-- Blocks either way between two arbitrary people. Unlike is_blocked_between
-- it never masks the answer, so it is not exposed to clients.
create function public.blocked_either(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b) or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

-- Could p_viewer open this post? The can_view_post rule, for someone other
-- than the caller (used to decide who may be notified about a post).
create function public.user_can_view_post(p_viewer uuid, p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    join public.profiles a on a.id = p.author_id
    where p.id = p_post
      and (
        p.author_id = p_viewer
        or exists (
          select 1 from public.post_collaborators c
          where c.post_id = p.id and c.user_id = p_viewer and c.status = 'accepted'
        )
        or (
          p.status = 'published'
          and p.visibility <> 'private'
          and not public.blocked_either(p.author_id, p_viewer)
          and case
            when p.visibility = 'followers' or a.is_private then exists (
              select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p.author_id
            )
            else p.visibility = 'public'
          end
        )
      )
  );
$$;

-- "@name" tokens in a comment, lowercased, in order of appearance. A token
-- starts after a non-name character (so emails like a@b.co don't count) and
-- trailing dots are sentence punctuation, not part of the name.
create function public.mention_tokens(p_body text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(t.token order by t.ord), '{}')
  from (
    select distinct on (rtrim(lower(m.parts[1]), '.')) rtrim(lower(m.parts[1]), '.') as token, m.ord
    from regexp_matches(coalesce(p_body, ''), '(?:^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{3,30})', 'g')
      with ordinality as m (parts, ord)
    order by rtrim(lower(m.parts[1]), '.'), m.ord
  ) t
  where t.token ~ '^[a-z0-9_.]{3,24}$';
$$;

-- ---------------------------------------------------------------------------
-- Who can @mention you
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column mention_policy text not null default 'everyone',
  add constraint profiles_mention_policy check (mention_policy in ('everyone', 'following', 'nobody'));
grant update (mention_policy) on public.profiles to authenticated;

create function public.accepts_mention_from(p_target uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select p.mention_policy from public.profiles p where p.id = p_target), 'nobody')
    when 'everyone' then true
    -- "People I follow"
    when 'following' then exists (
      select 1 from public.follows f where f.follower_id = p_target and f.following_id = p_actor
    )
    else false
  end;
$$;

alter table public.notification_preferences add column mentions boolean not null default true;
grant update (mentions) on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Uploads (written only by the comment-media Edge Function)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-media', 'comment-media', false, 3 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.comment_uploads (
  id          uuid primary key,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  path        text not null unique,
  thumb_path  text not null unique,
  mime        text not null,
  bytes       integer not null,
  width       integer not null,
  height      integer not null,
  created_at  timestamptz not null default now(),
  constraint comment_uploads_kind check (kind in ('photo', 'sticker')),
  constraint comment_uploads_mime check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint comment_uploads_bytes check (bytes between 1 and 3 * 1024 * 1024),
  constraint comment_uploads_size check (width between 1 and 4096 and height between 1 and 4096),
  -- Files live under the owner's folder with safe names only.
  constraint comment_uploads_paths check (
    public.is_safe_storage_path(path) and public.is_safe_storage_path(thumb_path)
    and split_part(path, '/', 1) = owner_id::text and split_part(thumb_path, '/', 1) = owner_id::text
  )
);

create index comment_uploads_owner_idx on public.comment_uploads (owner_id, created_at desc);
create index comment_uploads_created_idx on public.comment_uploads (created_at);

alter table public.comment_uploads enable row level security;
revoke all on public.comment_uploads from anon, authenticated;
grant select on public.comment_uploads to authenticated;
create policy comment_uploads_select_own on public.comment_uploads
  for select to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Comments: attachment, mentions, image-only bodies
-- ---------------------------------------------------------------------------
alter table public.comments
  add column media_upload_id     uuid references public.comment_uploads (id),
  add column media_kind          text,
  add column media_path          text,
  add column media_thumb_path    text,
  add column media_width         integer,
  add column media_height        integer,
  add column media_hidden_at     timestamptz,
  add column media_hidden_reason text,
  add column mention_ids         uuid[] not null default '{}',
  add constraint comments_media_kind check (media_kind is null or media_kind in ('photo', 'sticker')),
  add constraint comments_media_complete check (
    (media_upload_id is null and media_path is null and media_thumb_path is null and media_kind is null)
    or (media_upload_id is not null and media_path is not null and media_thumb_path is not null and media_kind is not null)
  ),
  add constraint comments_mentions_max check (cardinality(mention_ids) <= 5);

-- Text, a picture, or both: an empty body is fine only with a picture.
alter table public.comments drop constraint comments_body_length;
alter table public.comments add constraint comments_body_length check (
  char_length(btrim(body)) <= 1000 and (char_length(btrim(body)) >= 1 or media_upload_id is not null)
);

create unique index comments_media_upload_key on public.comments (media_upload_id) where media_upload_id is not null;
create index comments_media_path_idx on public.comments (media_path) where media_path is not null;
create index comments_media_thumb_idx on public.comments (media_thumb_path) where media_thumb_path is not null;
create index comments_author_recent_idx on public.comments (author_id, created_at desc);

revoke insert on public.comments from authenticated;
grant insert (post_id, author_id, body, parent_id, reply_to_user_id, media_upload_id, mention_ids)
  on public.comments to authenticated;

-- Authors can't change the picture or moderation fields after posting.
create or replace function public.comments_protect_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
    new.media_hidden_at := old.media_hidden_at;
    new.media_hidden_reason := old.media_hidden_reason;
    new.media_upload_id := old.media_upload_id;
    new.media_kind := old.media_kind;
    new.media_path := old.media_path;
    new.media_thumb_path := old.media_thumb_path;
    new.media_width := old.media_width;
    new.media_height := old.media_height;
    new.mention_ids := old.mention_ids;
  end if;
  return new;
end;
$$;

create table public.comment_mentions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- The name as written in the comment ("@oldname"), to find it in the text.
  username   text not null,
  primary key (comment_id, user_id)
);
create index comment_mentions_user_idx on public.comment_mentions (user_id);

alter table public.comment_mentions enable row level security;
revoke all on public.comment_mentions from anon, authenticated;
grant select on public.comment_mentions to authenticated;
-- Visible exactly when the comment is.
create policy comment_mentions_select on public.comment_mentions
  for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_mentions.comment_id));

-- Limits
--   ≤ 5 mentions per comment (constraint above)
--   ≤ 20 photo/sticker comments per hour per person
--   ≤ 20 mention notifications per hour per person, ≤ 5 a day to one person
create function public.comments_media_mentions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up public.comment_uploads;
  v_tokens text[];
begin
  -- Attachment: must be the author's own, fresh, never used.
  new.media_hidden_at := null;
  new.media_hidden_reason := null;
  if new.media_upload_id is null then
    new.media_kind := null;
    new.media_path := null;
    new.media_thumb_path := null;
    new.media_width := null;
    new.media_height := null;
  else
    select * into v_up from public.comment_uploads u where u.id = new.media_upload_id for update;
    if v_up.id is null or v_up.owner_id <> new.author_id then
      raise exception 'attachment not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.comments c where c.media_upload_id = new.media_upload_id) then
      raise exception 'attachment already used' using errcode = '23505';
    end if;
    if v_up.created_at < now() - interval '1 hour' then
      raise exception 'attachment expired' using errcode = 'P0002';
    end if;
    if (select count(*) from public.comments c
        where c.author_id = new.author_id and c.media_upload_id is not null
          and c.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'too many photo comments' using errcode = '53400';
    end if;
    new.media_kind := v_up.kind;
    new.media_path := v_up.path;
    new.media_thumb_path := v_up.thumb_path;
    new.media_width := v_up.width;
    new.media_height := v_up.height;
  end if;

  -- Mentions: keep only real, current, allowed people the text names.
  new.mention_ids := coalesce(new.mention_ids, '{}');
  if cardinality(new.mention_ids) > 0 then
    if (select count(distinct x) from unnest(new.mention_ids) x) > 5 then
      raise exception 'up to 5 mentions per comment' using errcode = '23514';
    end if;
    v_tokens := public.mention_tokens(new.body);
    new.mention_ids := coalesce((
      select array_agg(p.id order by array_position(v_tokens, p.username))
      from public.profiles p
      where p.id = any(new.mention_ids)
        and p.username = any(v_tokens)
        and p.id <> new.author_id
        and p.suspended_at is null
        and not public.blocked_either(p.id, new.author_id)
        and public.accepts_mention_from(p.id, new.author_id)
    ), '{}');
  end if;
  return new;
end;
$$;

create trigger comments_media_mentions_before_insert
  before insert on public.comments
  for each row execute function public.comments_media_mentions_before_insert();

create function public.comments_mentions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_already uuid;
  v_target uuid;
  v_sent integer;
begin
  if cardinality(new.mention_ids) = 0 then
    return null;
  end if;

  insert into public.comment_mentions (comment_id, user_id, username)
  select new.id, p.id, p.username from public.profiles p where p.id = any(new.mention_ids)
  on conflict do nothing;

  -- Whoever comments_notify already tells about this comment gets no second one.
  if new.parent_id is null then
    select author_id into v_already from public.posts where id = new.post_id;
  else
    select coalesce(new.reply_to_user_id, c.author_id) into v_already from public.comments c where c.id = new.parent_id;
  end if;

  select count(*) into v_sent from public.notifications n
  where n.actor_id = new.author_id and n.type = 'comment_mention' and n.created_at > now() - interval '1 hour';

  foreach v_target in array new.mention_ids loop
    continue when v_target is not distinct from v_already;
    continue when v_target = new.author_id;
    continue when v_sent >= 20;
    continue when not public.user_can_view_post(v_target, new.post_id);
    continue when (select count(*) from public.notifications n
                   where n.actor_id = new.author_id and n.recipient_id = v_target and n.type = 'comment_mention'
                     and n.created_at > now() - interval '1 day') >= 5;
    perform public.notify(v_target, new.author_id, 'comment_mention', new.post_id, new.id);
    v_sent := v_sent + 1;
  end loop;
  return null;
end;
$$;

create trigger comments_mentions_after_insert
  after insert on public.comments
  for each row execute function public.comments_mentions_after_insert();

-- ---------------------------------------------------------------------------
-- Mention suggestions: friends first, then people you follow, people who
-- follow you, people in this post's conversation, then everyone else.
-- Never: yourself, blocked either way, suspended, or people whose setting
-- doesn't accept mentions from you.
-- ---------------------------------------------------------------------------
create function public.mention_suggestions(p_query text, p_post uuid default null, p_limit integer default 8)
returns table (id uuid, username text, display_name text, avatar_path text, relation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_term text := lower(btrim(coalesce(p_query, '')));
  v_pat text;
begin
  if v_me is null then
    return;
  end if;
  v_term := ltrim(v_term, '@');
  if char_length(v_term) > 30 then
    return;
  end if;
  v_pat := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with
  following as (select f.following_id as uid from public.follows f where f.follower_id = v_me),
  followers as (select f.follower_id as uid from public.follows f where f.following_id = v_me),
  thread as (
    select c.author_id as uid from public.comments c
    where p_post is not null and c.post_id = p_post
      and public.user_can_view_post(v_me, p_post)
    union
    select p.author_id from public.posts p
    where p_post is not null and p.id = p_post and public.user_can_view_post(v_me, p_post)
  ),
  candidates as (
    select p.id, p.username, p.display_name, p.avatar_path,
           (p.id in (select uid from following)) as i_follow,
           (p.id in (select uid from followers)) as follows_me,
           (p.id in (select uid from thread)) as in_thread
    from public.profiles p
    where p.id <> v_me
      and p.suspended_at is null
      and (
        -- With nothing typed yet, only people you know.
        (v_term = '' and (p.id in (select uid from following) or p.id in (select uid from followers)
                          or p.id in (select uid from thread)))
        or (v_term <> '' and (p.username like v_pat || '%' or lower(p.display_name) like v_pat || '%'
                              or lower(p.display_name) like '% ' || v_pat || '%'))
      )
  )
  select c.id, c.username, c.display_name, c.avatar_path,
         case
           when c.i_follow and c.follows_me then 'mutual'
           when c.i_follow then 'following'
           when c.follows_me then 'follower'
           when c.in_thread then 'thread'
           else 'other'
         end
  from candidates c
  where not public.blocked_either(v_me, c.id)
    and public.accepts_mention_from(c.id, v_me)
  order by
    (c.username = v_term) desc,
    case
      when c.i_follow and c.follows_me then 0
      when c.i_follow then 1
      when c.follows_me then 2
      when c.in_thread then 3
      else 4
    end,
    (c.username like v_pat || '%') desc,
    c.username
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type;
alter table public.notifications add constraint notifications_type check (type in (
  'follow', 'follow_request', 'follow_accepted', 'post_like', 'comment', 'comment_reply', 'comment_like',
  'collab_invite', 'collab_accepted', 'comment_mention'
));

create or replace function public.push_wanted(p_user uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p_type in ('follow', 'follow_request', 'follow_accepted') then np.follows
      when p_type in ('post_like', 'comment_like') then np.likes
      when p_type = 'comment_mention' then np.mentions
      else np.comments
    end
    from public.notification_preferences np where np.user_id = p_user
  ), true);
$$;

-- Same as before plus mentions, and the comment id so a tap can open it.
-- (path keeps its old shape so older app versions still open the post.)
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
  select username into v_actor from public.profiles where id = p_notification.actor_id;
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
        else '/user/' || p_notification.actor_id end
    ))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: read access follows the comment
-- ---------------------------------------------------------------------------
create policy comment_media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comment-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_moderator()
      or exists (
        select 1 from public.comments c
        where (c.media_path = objects.name or c.media_thumb_path = objects.name)
          and c.media_hidden_at is null
      )
    )
  );
-- No insert/update/delete policies: only the Edge Function (service role)
-- writes or removes comment-media files.

-- ---------------------------------------------------------------------------
-- Cleanup (service role only): uploads no comment uses, older than an hour,
-- and not held as evidence by an open report.
-- ---------------------------------------------------------------------------
create function public.comment_uploads_to_sweep(p_limit integer default 50)
returns table (id uuid, path text, thumb_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.path, u.thumb_path
  from public.comment_uploads u
  where u.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.comments c where c.media_upload_id = u.id)
    and not exists (
      select 1 from public.reports r
      where r.status in ('open', 'reviewed') and r.target_snapshot -> 'media' ->> 'path' = u.path
    )
  order by u.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Forget swept uploads (after their files were removed). Re-checks that no
-- comment took one in the meantime.
create function public.forget_comment_uploads(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.comment_uploads u
    where u.id = any(p_ids)
      and not exists (select 1 from public.comments c where c.media_upload_id = u.id)
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- Moderation: reports keep the picture as evidence; moderators can remove
-- just the picture (the text stays) or the whole comment.
-- ---------------------------------------------------------------------------
create or replace function public.reports_before_insert()
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
    select c.author_id,
           jsonb_strip_nulls(jsonb_build_object(
             'body', c.body, 'post_id', c.post_id,
             'mentions', (select jsonb_agg(m.username) from public.comment_mentions m where m.comment_id = c.id),
             'media', case when c.media_path is not null then jsonb_build_object(
               'kind', c.media_kind, 'path', c.media_path, 'thumb', c.media_thumb_path,
               'width', c.media_width, 'height', c.media_height) end))
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

alter table public.moderation_actions drop constraint moderation_actions_action;
alter table public.moderation_actions add constraint moderation_actions_action check (action in (
  'dismiss', 'remove', 'restore', 'suspend', 'unsuspend', 'auto_hide',
  'review', 'resolve', 'reopen', 'note', 'remove_media', 'restore_media'
));

-- Remove (or bring back) a reported comment's picture, keeping its text.
-- Removing resolves the comment's open reports; every change is logged.
create function public.admin_moderate_comment_media(
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
  v_note text := left(coalesce(p_note, ''), 2000);
  v_status text;
begin
  perform public.assert_moderator();
  if p_action not in ('remove_media', 'restore_media') then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_r.status is distinct from p_expected then
    raise exception 'this report was changed by someone else (now %); reload it', v_r.status using errcode = '40001';
  end if;
  if v_r.target_type <> 'comment' or v_r.target_comment_id is null then
    raise exception 'the reported content no longer exists' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.comments c where c.id = v_r.target_comment_id and c.media_path is not null) then
    raise exception 'this comment has no picture' using errcode = '22023';
  end if;

  if p_action = 'remove_media' then
    update public.comments
      set media_hidden_at = now(),
          media_hidden_reason = coalesce(nullif(btrim(v_note), ''), 'Removed for breaking the Community Guidelines')
      where id = v_r.target_comment_id;
    v_status := 'actioned';
    update public.reports
      set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
          resolution_note = case when btrim(v_note) <> '' then v_note else resolution_note end
      where status in ('open', 'reviewed') and target_comment_id = v_r.target_comment_id;
  else
    update public.comments set media_hidden_at = null, media_hidden_reason = null
      where id = v_r.target_comment_id;
  end if;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id, from_status, to_status)
  values (auth.uid(), 'comment', v_r.target_comment_id, p_action, v_note, v_r.id, v_r.status, v_status);
end;
$$;

-- admin_report_detail: the comment's current picture and mentions too.
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
    select jsonb_strip_nulls(jsonb_build_object(
             'exists', true, 'body', c.body, 'hidden', c.hidden_at is not null,
             'hidden_reason', c.hidden_reason, 'post_id', c.post_id,
             'post_title', (select p.title from public.posts p where p.id = c.post_id),
             'mentions', (select jsonb_agg(m.username) from public.comment_mentions m where m.comment_id = c.id),
             'media', case when c.media_path is not null then jsonb_build_object(
               'kind', c.media_kind, 'path', c.media_path, 'thumb', c.media_thumb_path,
               'width', c.media_width, 'height', c.media_height,
               'hidden', c.media_hidden_at is not null, 'hidden_reason', c.media_hidden_reason) end))
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
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.blocked_either(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_can_view_post(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accepts_mention_from(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mention_tokens(text) from public, anon;
revoke all on function public.comments_media_mentions_before_insert() from public, anon, authenticated;
revoke all on function public.comments_mentions_after_insert() from public, anon, authenticated;
revoke all on function public.mention_suggestions(text, uuid, integer) from public, anon;
revoke all on function public.comment_uploads_to_sweep(integer) from public, anon, authenticated;
revoke all on function public.forget_comment_uploads(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_moderate_comment_media(uuid, text, text, text) from public, anon;
grant execute on function public.mention_tokens(text) to authenticated;
grant execute on function public.mention_suggestions(text, uuid, integer) to authenticated;
grant execute on function public.admin_moderate_comment_media(uuid, text, text, text) to authenticated;
grant execute on function public.comment_uploads_to_sweep(integer) to service_role;
grant execute on function public.forget_comment_uploads(uuid[]) to service_role;
