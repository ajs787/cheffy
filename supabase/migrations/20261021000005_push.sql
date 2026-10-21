-- Push notifications: device tokens, per-person preferences, and delivery.
--
-- Delivery runs in the database: each new notification is sent to the
-- recipient's devices through Expo's push service (pg_net, async), honouring
-- their preferences. No push credentials live in the app; Apple's push key
-- is managed by EAS when the app is built.

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon;
grant select, delete on public.push_tokens to authenticated;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- Registers this device for the caller. A token belongs to one device, so it
-- moves to whoever signed in on it last.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) > 300 or p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create table public.notification_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  follows    boolean not null default true,
  likes      boolean not null default true,
  comments   boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
grant select, insert on public.notification_preferences to authenticated;
-- user_id is included so upserts work; the policies pin it to the caller.
grant update (user_id, follows, likes, comments, updated_at) on public.notification_preferences to authenticated;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

-- What the push says and where tapping it goes (pure, for testing).
create function public.push_message(p_notification public.notifications)
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
  end;
  return jsonb_build_object(
    'title', 'Cheffy',
    'body', coalesce(v_actor, 'Someone') || ' ' || v_text,
    'sound', 'default',
    'data', jsonb_build_object(
      'notificationId', p_notification.id,
      'path', case when p_notification.post_id is not null
        then '/post/' || p_notification.post_id
        else '/user/' || p_notification.actor_id end
    )
  );
end;
$$;

-- Which preference governs a notification type.
create function public.push_wanted(p_user uuid, p_type text)
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
      else np.comments
    end
    from public.notification_preferences np where np.user_id = p_user
  ), true);
$$;

create function public.notifications_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
  v_message jsonb;
  v_badge integer;
begin
  -- Backfills arrive already read; nothing to send.
  if new.read_at is not null or not public.push_wanted(new.recipient_id, new.type) then
    return null;
  end if;
  -- pg_net isn't available everywhere (e.g. local tests): skip quietly.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return null;
  end if;

  select count(*)::integer into v_badge
  from public.notifications n where n.recipient_id = new.recipient_id and n.read_at is null;
  v_message := public.push_message(new) || jsonb_build_object('badge', v_badge);

  select jsonb_agg(v_message || jsonb_build_object('to', t.token)) into v_messages
  from public.push_tokens t where t.user_id = new.recipient_id;
  if v_messages is null then
    return null;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
  using 'https://exp.host/--/api/v2/push/send',
        v_messages,
        '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  return null;
end;
$$;

create trigger notifications_send_push
  after insert on public.notifications
  for each row execute function public.notifications_send_push();

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.push_message(public.notifications) from public, anon, authenticated;
revoke all on function public.push_wanted(uuid, text) from public, anon, authenticated;
revoke all on function public.notifications_send_push() from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
