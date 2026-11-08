-- Anonymous likes: a like that counts but never shows who gave it.
--
-- The row keeps user_id (so unliking, "you liked this" and moderation still
-- work), but nobody else can read an anonymous like row: the like lists and
-- previews leave it out, and the owner's notification carries no actor.
-- Available to the same accounts as Anonymous Takes (the rollout flag).

-- ---------------------------------------------------------------------------
-- 1. The flag on each like
-- ---------------------------------------------------------------------------
alter table public.likes add column anonymous boolean not null default false;
alter table public.comment_likes add column anonymous boolean not null default false;

-- Other people's anonymous likes are invisible; your own stay readable.
drop policy likes_select on public.likes;
create policy likes_select on public.likes
  for select to authenticated
  using (
    (not anonymous or user_id = (select auth.uid()))
    and exists (select 1 from public.posts p where p.id = likes.post_id)
  );

drop policy comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (
    (not anonymous or user_id = (select auth.uid()))
    and exists (select 1 from public.comments c where c.id = comment_likes.comment_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Who may like anonymously, and how often
-- ---------------------------------------------------------------------------
-- Every anonymous like is logged here, and the log outlives an unlike, so
-- liking and unliking in a loop can't dodge the limit or flood someone with
-- "A chef liked your post". Private: no client access.
create table public.anonymous_like_log (
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index anonymous_like_log_user_idx on public.anonymous_like_log (user_id, created_at);
alter table public.anonymous_like_log enable row level security;
revoke all on public.anonymous_like_log from public, anon, authenticated;

insert into public.app_config (key, value)
values ('anonymous_likes.hourly_limit', '60')
on conflict (key) do nothing;

create function public.anonymous_like_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.anonymous then
    return new;
  end if;
  if not public.anonymous_takes_enabled_for(new.user_id) then
    raise exception 'anonymous likes aren''t available' using errcode = '42501';
  end if;
  if (select count(*) from public.anonymous_like_log l
      where l.user_id = new.user_id and l.created_at > now() - interval '1 hour')
     >= public.config_number('anonymous_likes.hourly_limit', 60) then
    raise exception 'slow down: too many likes' using errcode = 'P0001';
  end if;
  delete from public.anonymous_like_log l
  where l.user_id = new.user_id and l.created_at < now() - interval '1 day';
  insert into public.anonymous_like_log (user_id) values (new.user_id);
  return new;
end;
$$;

create trigger likes_anonymous_check
  before insert on public.likes
  for each row execute function public.anonymous_like_check();

create trigger comment_likes_anonymous_check
  before insert on public.comment_likes
  for each row execute function public.anonymous_like_check();

-- ---------------------------------------------------------------------------
-- 3. Notifications: "A chef liked your post"
-- ---------------------------------------------------------------------------
-- Anonymous like notifications for one target are all alike, so an anonymous
-- unlike removes any one of them.
create function public.unnotify_anonymously(
  p_recipient uuid, p_type text, p_post uuid, p_comment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications
  where id = (
    select n.id from public.notifications n
    where n.recipient_id = p_recipient and n.actor_id is null and n.type = p_type
      and n.post_id is not distinct from p_post and n.comment_id is not distinct from p_comment
    order by n.created_at desc
    limit 1
  );
$$;

create or replace function public.likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into v_author from public.posts where id = new.post_id;
    if new.anonymous then
      perform public.notify_anonymously(v_author, new.user_id, 'post_like', new.post_id, null);
    else
      perform public.notify(v_author, new.user_id, 'post_like', new.post_id);
    end if;
  else
    select author_id into v_author from public.posts where id = old.post_id;
    if old.anonymous then
      perform public.unnotify_anonymously(v_author, 'post_like', old.post_id, null);
    else
      perform public.unnotify(v_author, old.user_id, 'post_like', old.post_id);
    end if;
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
    if new.anonymous then
      perform public.notify_anonymously(public.comment_author_id(v_comment), new.user_id,
                                        'comment_like', v_comment.post_id, new.comment_id);
    else
      perform public.notify(public.comment_author_id(v_comment), new.user_id,
                            'comment_like', v_comment.post_id, new.comment_id);
    end if;
  else
    select * into v_comment from public.comments where id = old.comment_id;
    if old.anonymous then
      perform public.unnotify_anonymously(public.comment_author_id(v_comment), 'comment_like',
                                          v_comment.post_id, old.comment_id);
    else
      perform public.unnotify(public.comment_author_id(v_comment), old.user_id,
                              'comment_like', v_comment.post_id, old.comment_id);
    end if;
  end if;
  return null;
end;
$$;

-- Push text. A like's comment is the liked one (often the recipient's own
-- take), so its Chef number is never used for a like: it's "A chef".
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
    if p_notification.type in ('post_like', 'comment_like') then
      v_actor := 'A chef';
    else
      select public.anonymous_name(c.anon_number) into v_actor from public.comments c where c.id = p_notification.comment_id;
    end if;
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
-- 4. What the app reads
-- ---------------------------------------------------------------------------
-- Whether the viewer's own like is anonymous (only ever about the viewer).
create function public.viewer_liked_anonymously(p public.posts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.likes l
    where l.user_id = auth.uid() and l.post_id = p.id and l.anonymous
  );
$$;

create function public.viewer_liked_comment_anonymously(c public.comments)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.comment_likes l
    where l.user_id = auth.uid() and l.comment_id = c.id and l.anonymous
  );
$$;

-- How many likes on a post are anonymous, for "+ 3 liked anonymously" under
-- the likes list. Says nothing the like count doesn't already.
create function public.anonymous_like_count(p_post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.user_can_view_post(auth.uid(), p_post)
    then (select count(*)::int from public.likes l where l.post_id = p_post and l.anonymous)
    else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Access
-- ---------------------------------------------------------------------------
revoke all on function public.anonymous_like_check() from public, anon, authenticated;
revoke all on function public.unnotify_anonymously(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.viewer_liked_anonymously(public.posts) from public, anon;
revoke all on function public.viewer_liked_comment_anonymously(public.comments) from public, anon;
revoke all on function public.anonymous_like_count(uuid) from public, anon;
grant execute on function public.viewer_liked_anonymously(public.posts) to authenticated;
grant execute on function public.viewer_liked_comment_anonymously(public.comments) to authenticated;
grant execute on function public.anonymous_like_count(uuid) to authenticated;
