-- Collaborative posts: one shared creation, several co-creators.
--
-- The post's author_id is the creator (owner). Others are invited through
-- post_collaborators (pending → accepted / declined; accepted → removed when
-- they leave or the creator removes them). Each accepted collaborator keeps
-- their own 0–10 rating and review in post_evaluations; the creator's stays
-- on posts.rating. Likes, comments and photos belong to the single shared
-- post — nothing is duplicated. All writes go through checked functions, so
-- nobody can add themselves to someone else's post.

create table public.post_collaborators (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending',
  invited_by   uuid not null references public.profiles (id) on delete cascade,
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (post_id, user_id),
  constraint post_collaborators_status check (status in ('pending', 'accepted', 'declined', 'removed'))
);

create index post_collaborators_user_idx on public.post_collaborators (user_id, status);

create table public.post_evaluations (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rating     numeric(3, 1) not null,
  review     text not null default '',
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint post_evaluations_rating check (rating between 0 and 10),
  constraint post_evaluations_review_length check (char_length(review) <= 2000)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.collaboration_status(p_post uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.status from public.post_collaborators c where c.post_id = p_post and c.user_id = p_user;
$$;

-- Everything someone made: posts they created (their rating is posts.rating)
-- and accepted collaborations (their own evaluation). p_rated_only drops
-- collaborations they haven't rated yet (rankings need a number).
create function public.creations_of(p_user uuid, p_rated_only boolean default true)
returns table (post_id uuid, my_rating numeric)
language sql
stable
set search_path = ''
as $$
  select p.id, p.rating from public.posts p where p.author_id = p_user
  union all
  select c.post_id, e.rating
  from public.post_collaborators c
  left join public.post_evaluations e on e.post_id = c.post_id and e.user_id = c.user_id
  where c.user_id = p_user and c.status = 'accepted'
    and (not p_rated_only or e.rating is not null);
$$;

-- ---------------------------------------------------------------------------
-- Visibility: invitees and collaborators always see the shared post (and so
-- its photos, comments and likes, which follow the post). Everyone else gets
-- the creator's rules, unchanged.
-- ---------------------------------------------------------------------------
drop policy posts_select_visible on public.posts;
create policy posts_select_visible on public.posts
  for select to authenticated
  using (
    public.can_view_post(author_id, visibility, status)
    or (status = 'published'
        and public.collaboration_status(id, (select auth.uid())) in ('pending', 'accepted'))
  );

alter table public.post_collaborators enable row level security;
alter table public.post_evaluations enable row level security;
revoke all on public.post_collaborators from anon;
revoke all on public.post_evaluations from anon;
-- Writes only through the functions below.
grant select on public.post_collaborators to authenticated;
grant select on public.post_evaluations to authenticated;

-- Accepted co-creators are public with the post; pending/declined/removed
-- rows are only for the creator and the invitee.
create policy post_collaborators_select on public.post_collaborators
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_collaborators.post_id)
    and (
      status = 'accepted'
      or user_id = (select auth.uid())
      or exists (select 1 from public.posts p
                 where p.id = post_collaborators.post_id and p.author_id = (select auth.uid()))
    )
  );

create policy post_evaluations_select on public.post_evaluations
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_evaluations.post_id));

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

-- The creator invites existing users to a published post. Re-inviting
-- someone who declined or left asks them again.
create function public.invite_collaborators(p_post uuid, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_user uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_post from public.posts where id = p_post;
  if v_post.id is null or v_post.author_id <> auth.uid() then
    raise exception 'only the creator can invite collaborators' using errcode = '42501';
  end if;
  if v_post.status <> 'published' then
    raise exception 'publish the creation before inviting collaborators' using errcode = '22023';
  end if;

  foreach v_user in array coalesce(p_users, '{}') loop
    if v_user = auth.uid() then
      raise exception 'you are already the creator' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles where id = v_user)
       or public.is_blocked_between(auth.uid(), v_user) then
      raise exception 'that person can''t be invited' using errcode = '22023';
    end if;
    insert into public.post_collaborators (post_id, user_id, status, invited_by, invited_at, responded_at)
    values (p_post, v_user, 'pending', auth.uid(), now(), null)
    on conflict (post_id, user_id) do update
      set status = 'pending', invited_by = excluded.invited_by, invited_at = now(), responded_at = null
      where public.post_collaborators.status in ('declined', 'removed');
  end loop;

  if (select count(*) from public.post_collaborators
      where post_id = p_post and status in ('pending', 'accepted')) > 5 then
    raise exception 'a creation can have at most 5 collaborators' using errcode = '22023';
  end if;
end;
$$;

-- The invitee accepts or declines their own pending invitation.
create function public.respond_to_collaboration(p_post uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.post_collaborators
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where post_id = p_post and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'no pending invitation' using errcode = 'P0002';
  end if;
end;
$$;

-- A collaborator leaves (the creation stays with its creator), or the
-- creator removes someone. Their personal rating and review go with them.
create function public.remove_collaborator(p_post uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select author_id into v_author from public.posts where id = p_post;
  if p_user <> auth.uid() and v_author is distinct from auth.uid() then
    raise exception 'only the creator can remove others' using errcode = '42501';
  end if;
  update public.post_collaborators
  set status = 'removed', responded_at = now()
  where post_id = p_post and user_id = p_user and status in ('pending', 'accepted');
  if not found then
    raise exception 'not a collaborator' using errcode = 'P0002';
  end if;
  delete from public.post_evaluations where post_id = p_post and user_id = p_user;
end;
$$;

-- An accepted collaborator's own rating and review. Never touches anyone
-- else's (the creator's lives on the post; each collaborator has a row).
create function public.set_my_evaluation(p_post uuid, p_rating numeric, p_review text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.collaboration_status(p_post, auth.uid()) is distinct from 'accepted' then
    raise exception 'only accepted collaborators can rate this creation' using errcode = '42501';
  end if;
  insert into public.post_evaluations (post_id, user_id, rating, review, updated_at)
  values (p_post, auth.uid(), round(p_rating, 1), btrim(coalesce(p_review, '')), now())
  on conflict (post_id, user_id) do update
    set rating = excluded.rating, review = excluded.review, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: invitations and acceptances
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type;
alter table public.notifications add constraint notifications_type check (type in (
  'follow', 'follow_request', 'follow_accepted', 'post_like', 'comment', 'comment_reply', 'comment_like',
  'collab_invite', 'collab_accepted'
));

create function public.post_collaborators_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    perform public.notify(new.user_id, new.invited_by, 'collab_invite', new.post_id);
  elsif new.status <> 'pending' and tg_op = 'UPDATE' and old.status = 'pending' then
    perform public.unnotify(new.user_id, new.invited_by, 'collab_invite', new.post_id);
  end if;
  if new.status = 'accepted' and tg_op = 'UPDATE' and old.status <> 'accepted' then
    perform public.notify(v_author, new.user_id, 'collab_accepted', new.post_id);
  elsif new.status <> 'accepted' and tg_op = 'UPDATE' and old.status = 'accepted' then
    perform public.unnotify(v_author, new.user_id, 'collab_accepted', new.post_id);
  end if;
  return null;
end;
$$;

create trigger post_collaborators_notify
  after insert or update on public.post_collaborators
  for each row execute function public.post_collaborators_notify();

-- ---------------------------------------------------------------------------
-- Readers that now include shared creations
-- ---------------------------------------------------------------------------

-- A person's diary: what they created plus accepted collaborations.
create function public.diary_posts(
  p_user_id    uuid,
  p_primary_id uuid default null,
  p_before     date default null,
  p_before_id  uuid default null,
  p_limit      integer default 30
)
returns setof public.posts
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.posts p
  where p.status = 'published'
    and p.id in (select m.post_id from public.creations_of(p_user_id, false) m)
    and (p_primary_id is null or p.primary_category_id = p_primary_id)
    and (p_before is null or (p.made_on, p.id) < (p_before, p_before_id))
  order by p.made_on desc, p.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;

create or replace function public.get_rankings(
  p_user_id     uuid,
  p_primary_id  uuid default null,
  p_category_id uuid default null,
  p_tag_id      uuid default null,
  p_sort        text default 'highest',
  p_limit       integer default 30,
  p_offset      integer default 0
)
returns table (
  rank           bigint,
  total_count    bigint,
  post_id        uuid,
  title          text,
  rating         numeric,
  made_on        date,
  created_at     timestamptz,
  primary_slug   text,
  primary_name   text,
  secondary_name text,
  thumb_path     text
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select p.*, m.my_rating
    from public.creations_of(p_user_id) m
    join public.posts p on p.id = m.post_id
    where p.status = 'published'
      and (p_primary_id is null or p.primary_category_id = p_primary_id)
      and (p_category_id is null
           or p_category_id = p.meal_type_id
           or exists (select 1 from public.post_categories pc
                      where pc.post_id = p.id and pc.category_id = p_category_id))
      and (p_tag_id is null
           or exists (select 1 from public.post_tags pt where pt.post_id = p.id and pt.tag_id = p_tag_id))
  ),
  ranked as (
    select b.*,
           row_number() over (order by b.my_rating desc, b.made_on desc, b.created_at desc, b.id desc) as rnk,
           count(*) over () as total
    from base b
  )
  select
    r.rnk,
    r.total,
    r.id,
    r.title,
    r.my_rating,
    r.made_on,
    r.created_at,
    pc.slug,
    pc.name,
    (select string_agg(c.name, ' · ' order by pc.position)
       from public.post_categories pc join public.categories c on c.id = pc.category_id
      where pc.post_id = r.id),
    (select pi.thumb_path from public.post_images pi where pi.post_id = r.id order by pi.position limit 1)
  from ranked r
  join public.categories pc on pc.id = r.primary_category_id
  order by
    case when p_sort = 'lowest' then r.rnk end desc,
    case when p_sort = 'recent' then r.made_on end desc,
    case when p_sort = 'recent' then r.created_at end desc,
    case when p_sort = 'oldest' then r.made_on end asc,
    case when p_sort = 'oldest' then r.created_at end asc,
    r.rnk asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.ranking_filters(p_user_id uuid)
returns table (kind text, id uuid, slug text, name text, parent_id uuid, post_count bigint)
language sql
stable
set search_path = ''
as $$
  with visible as (
    select p.id, p.meal_type_id
    from public.creations_of(p_user_id) m
    join public.posts p on p.id = m.post_id
    where p.status = 'published'
  )
  select c.kind, c.id, c.slug, c.name, c.parent_id, count(*)
  from visible v
  join lateral (
    select pc.category_id from public.post_categories pc where pc.post_id = v.id
    union
    select v.meal_type_id where v.meal_type_id is not null
  ) x on true
  join public.categories c on c.id = x.category_id
  group by c.kind, c.id, c.slug, c.name, c.parent_id, c.sort_order
  union all
  select 'tag', t.id, t.slug, t.name, null::uuid, count(*)
  from visible v
  join public.post_tags pt on pt.post_id = v.id
  join public.tags t on t.id = pt.tag_id
  group by t.id, t.slug, t.name
  order by 1, 6 desc, 4;
$$;

create or replace function public.profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.has_blocked(p_user_id, auth.uid()) then null else jsonb_build_object(
    'followers', (select count(*) from public.follows f where f.following_id = p_user_id),
    'following', (select count(*) from public.follows f where f.follower_id = p_user_id),
    'posts', (
      select count(*) from public.posts p
      where p.id in (select m.post_id from public.creations_of(p_user_id, false) m) and p.status = 'published'
        and public.counts_toward_stats(p.author_id, p.visibility, p.status)
    ),
    'by_primary', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', coalesce(x.n, 0))
                       order by c.sort_order)
      from public.categories c
      left join (
        select p.primary_category_id, count(*) as n
        from public.posts p
        where p.id in (select m.post_id from public.creations_of(p_user_id, false) m) and p.status = 'published'
          and public.counts_toward_stats(p.author_id, p.visibility, p.status)
        group by p.primary_category_id
      ) x on x.primary_category_id = c.id
      where c.kind = 'primary' and c.is_active
    ), '[]'::jsonb)
  ) end;
$$;

create or replace function public.feed_posts(
  p_before    timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 20
)
returns setof public.posts
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.posts p
  where p.status = 'published'
    and (
      p.author_id = auth.uid()
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = p.author_id
      )
      -- Shared creations reach the followers of every accepted collaborator.
      or exists (
        select 1 from public.post_collaborators c
        where c.post_id = p.id and c.status = 'accepted'
          and (c.user_id = auth.uid() or exists (
            select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = c.user_id
          ))
      )
    )
    and (p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

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

revoke all on function public.collaboration_status(uuid, uuid) from public, anon;
revoke all on function public.creations_of(uuid, boolean) from public, anon;
revoke all on function public.invite_collaborators(uuid, uuid[]) from public, anon;
revoke all on function public.respond_to_collaboration(uuid, boolean) from public, anon;
revoke all on function public.remove_collaborator(uuid, uuid) from public, anon;
revoke all on function public.set_my_evaluation(uuid, numeric, text) from public, anon;
revoke all on function public.post_collaborators_notify() from public, anon, authenticated;
revoke all on function public.diary_posts(uuid, uuid, date, uuid, integer) from public, anon;
grant execute on function public.collaboration_status(uuid, uuid) to authenticated;
grant execute on function public.creations_of(uuid, boolean) to authenticated;
grant execute on function public.invite_collaborators(uuid, uuid[]) to authenticated;
grant execute on function public.respond_to_collaboration(uuid, boolean) to authenticated;
grant execute on function public.remove_collaborator(uuid, uuid) to authenticated;
grant execute on function public.set_my_evaluation(uuid, numeric, text) to authenticated;
grant execute on function public.diary_posts(uuid, uuid, date, uuid, integer) to authenticated;
