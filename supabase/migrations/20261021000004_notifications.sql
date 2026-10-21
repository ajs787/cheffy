-- Notifications: one row per thing worth telling someone, written by
-- triggers so clients can't fake or forget them. Undoing an action (unlike,
-- unfollow, cancelling a request, deleting a comment) removes its row.
-- Read state is server-side, so the unread badge is right on every device.

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid not null references public.profiles (id) on delete cascade,
  type         text not null,
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint notifications_type check (type in (
    'follow', 'follow_request', 'follow_accepted', 'post_like', 'comment', 'comment_reply', 'comment_like'
  )),
  constraint notifications_not_self check (recipient_id <> actor_id)
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Your own notifications, minus anyone in a block relationship with you.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) and not public.is_blocked_between(recipient_id, actor_id));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Writing them
-- ---------------------------------------------------------------------------
create function public.notify(
  p_recipient uuid, p_actor uuid, p_type text, p_post uuid default null, p_comment uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor or public.is_blocked_between(p_recipient, p_actor) then
    return;
  end if;
  -- One row per (actor, type, target): liking twice never stacks.
  delete from public.notifications n
  where n.recipient_id = p_recipient and n.actor_id = p_actor and n.type = p_type
    and n.post_id is not distinct from p_post and n.comment_id is not distinct from p_comment;
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  values (p_recipient, p_actor, p_type, p_post, p_comment);
end;
$$;

create function public.unnotify(
  p_recipient uuid, p_actor uuid, p_type text, p_post uuid default null, p_comment uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications n
  where n.recipient_id = p_recipient and n.actor_id = p_actor and n.type = p_type
    and n.post_id is not distinct from p_post and n.comment_id is not distinct from p_comment;
$$;

-- Follows. An accepted request tells the requester instead of the target
-- (accept_follow_request flags itself with a transaction-local setting).
create function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('cheffy.accepting_request', true), '') = 'on' then
      perform public.notify(new.follower_id, new.following_id, 'follow_accepted');
    else
      perform public.notify(new.following_id, new.follower_id, 'follow');
    end if;
  else
    perform public.unnotify(old.following_id, old.follower_id, 'follow');
    perform public.unnotify(old.follower_id, old.following_id, 'follow_accepted');
  end if;
  return null;
end;
$$;

create trigger follows_notify
  after insert or delete on public.follows
  for each row execute function public.follows_notify();

create or replace function public.accept_follow_request(p_requester uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.follow_requests
  where requester_id = p_requester and target_id = auth.uid();
  if not found then
    raise exception 'follow request not found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(p_requester, auth.uid()) then
    return;
  end if;
  perform set_config('cheffy.accepting_request', 'on', true);
  insert into public.follows (follower_id, following_id)
  values (p_requester, auth.uid())
  on conflict do nothing;
  perform set_config('cheffy.accepting_request', 'off', true);
end;
$$;

create function public.follow_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.target_id, new.requester_id, 'follow_request');
  else
    -- Accepted, declined or cancelled: the request notification is done.
    perform public.unnotify(old.target_id, old.requester_id, 'follow_request');
  end if;
  return null;
end;
$$;

create trigger follow_requests_notify
  after insert or delete on public.follow_requests
  for each row execute function public.follow_requests_notify();

-- Post likes.
create function public.likes_notify()
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
    perform public.notify(v_author, new.user_id, 'post_like', new.post_id);
  else
    select author_id into v_author from public.posts where id = old.post_id;
    perform public.unnotify(v_author, old.user_id, 'post_like', old.post_id);
  end if;
  return null;
end;
$$;

create trigger likes_notify
  after insert or delete on public.likes
  for each row execute function public.likes_notify();

-- Comments and replies (deleting a comment cascades its notifications).
create function public.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
begin
  select author_id into v_post_author from public.posts where id = new.post_id;
  if new.parent_id is null then
    perform public.notify(v_post_author, new.author_id, 'comment', new.post_id, new.id);
  else
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    perform public.notify(coalesce(new.reply_to_user_id, v_parent_author), new.author_id, 'comment_reply', new.post_id, new.id);
  end if;
  return null;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.comments_notify();

-- Comment likes.
create function public.comment_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_post uuid;
begin
  if tg_op = 'INSERT' then
    select author_id, post_id into v_author, v_post from public.comments where id = new.comment_id;
    perform public.notify(v_author, new.user_id, 'comment_like', v_post, new.comment_id);
  else
    select author_id, post_id into v_author, v_post from public.comments where id = old.comment_id;
    perform public.unnotify(v_author, old.user_id, 'comment_like', v_post, old.comment_id);
  end if;
  return null;
end;
$$;

create trigger comment_likes_notify
  after insert or delete on public.comment_likes
  for each row execute function public.comment_likes_notify();

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------
create function public.mark_notifications_read()
returns void
language sql
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and read_at is null;
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.notifications n
  where n.recipient_id = auth.uid() and n.read_at is null
    and not public.is_blocked_between(n.recipient_id, n.actor_id);
$$;

-- ---------------------------------------------------------------------------
-- Existing activity carries over, already read, so nobody gets a flood.
-- ---------------------------------------------------------------------------
insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id, created_at, read_at)
select p.author_id, l.user_id, 'post_like', l.post_id, null, l.created_at, now()
from public.likes l join public.posts p on p.id = l.post_id
where p.author_id <> l.user_id
union all
select p.author_id, c.author_id, 'comment', c.post_id, c.id, c.created_at, now()
from public.comments c join public.posts p on p.id = c.post_id
where c.parent_id is null and p.author_id <> c.author_id
union all
select f.following_id, f.follower_id, 'follow', null, null, f.created_at, now()
from public.follows f
union all
select r.target_id, r.requester_id, 'follow_request', null, null, r.created_at, null
from public.follow_requests r;

-- Live delivery for in-app banners (Supabase Realtime respects RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

revoke all on function public.notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.unnotify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.follows_notify() from public, anon;
revoke all on function public.follow_requests_notify() from public, anon;
revoke all on function public.likes_notify() from public, anon;
revoke all on function public.comments_notify() from public, anon;
revoke all on function public.comment_likes_notify() from public, anon;
revoke all on function public.mark_notifications_read() from public, anon;
revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
