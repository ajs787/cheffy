-- Private accounts and follow requests (Instagram-style).
--
-- Public account: anyone can follow immediately; public posts are visible.
-- Private account: the basic profile stays discoverable, but following needs
-- approval and only approved followers see posts, rankings and collections.
--
-- Enforcement lives in can_view_post(), which every post-attached table and
-- the post-images bucket already inherit, so Discover, search, direct links
-- and storage are all covered by the same rule. Removing a follower or going
-- private takes effect on the next request.

alter table public.profiles add column is_private boolean not null default false;
grant update (is_private) on public.profiles to authenticated;

-- A pending request. Accepting turns it into a follow; declining or
-- cancelling deletes it.
create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_requests_no_self check (requester_id <> target_id)
);

create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.is_private_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_private from public.profiles p where p.id = p_user), false);
$$;

-- Can the caller see this person's content (posts, rankings, collections)?
create function public.can_view_content_of(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_owner = auth.uid() then true
    when public.is_blocked_between(auth.uid(), p_owner) then false
    when public.is_private_account(p_owner) then public.is_following(auth.uid(), p_owner)
    else true
  end;
$$;

-- The single visibility rule, now account-aware: a private account's posts
-- are followers-only whatever their own visibility says.
create or replace function public.can_view_post(p_author_id uuid, p_visibility text, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_author_id = auth.uid() then true
    when p_status <> 'published' then false
    when p_visibility = 'private' then false
    when not public.can_view_content_of(p_author_id) then false
    when p_visibility = 'public' then true
    when p_visibility = 'followers' then public.is_following(auth.uid(), p_author_id)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Following someone private must go through a request.
drop policy follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked_between(follower_id, following_id)
    and not public.is_private_account(following_id)
  );

alter table public.follow_requests enable row level security;
revoke all on public.follow_requests from anon;
grant select, insert, delete on public.follow_requests to authenticated;

-- Only the two people involved can see a request.
create policy follow_requests_select on public.follow_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

create policy follow_requests_insert_own on public.follow_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and public.is_private_account(target_id)
    and not public.is_blocked_between(requester_id, target_id)
    and not public.is_following(requester_id, target_id)
  );

-- The requester cancels; the target declines.
create policy follow_requests_delete on public.follow_requests
  for delete to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

-- Collections follow the owner's account privacy too.
drop policy collections_select on public.collections;
create policy collections_select on public.collections
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (visibility = 'public' and public.can_view_content_of(owner_id))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Follow, or ask to: decided in the database so it can't race a privacy
-- switch. Returns 'following' or 'requested'.
create function public.follow_user(p_target uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.is_following(auth.uid(), p_target) then
    return 'following';
  end if;
  if public.is_private_account(p_target) then
    insert into public.follow_requests (requester_id, target_id)
    values (auth.uid(), p_target)
    on conflict do nothing;
    return 'requested';
  end if;
  insert into public.follows (follower_id, following_id)
  values (auth.uid(), p_target)
  on conflict do nothing;
  return 'following';
end;
$$;

-- The target approves a pending request. Security definer because the follow
-- row belongs to the requester; it only acts on a request addressed to the
-- caller.
create function public.accept_follow_request(p_requester uuid)
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
  insert into public.follows (follower_id, following_id)
  values (p_requester, auth.uid())
  on conflict do nothing;
end;
$$;

-- What a post counts toward on a profile: what you can see, except that on a
-- private account you're not approved for you see what a follower would.
create function public.counts_toward_stats(p_author_id uuid, p_visibility text, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_post(p_author_id, p_visibility, p_status)
    or (
      p_status = 'published'
      and p_visibility in ('public', 'followers')
      and public.is_private_account(p_author_id)
      and not public.is_blocked_between(auth.uid(), p_author_id)
    );
$$;

-- Counts stay visible on private profiles (like Instagram); content doesn't.
-- Security definer so private accounts don't show "0 posts" to non-followers.
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
      where p.author_id = p_user_id and p.status = 'published'
        and public.counts_toward_stats(p.author_id, p.visibility, p.status)
    ),
    'by_primary', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', coalesce(x.n, 0))
                       order by c.sort_order)
      from public.categories c
      left join (
        select p.primary_category_id, count(*) as n
        from public.posts p
        where p.author_id = p_user_id and p.status = 'published'
          and public.counts_toward_stats(p.author_id, p.visibility, p.status)
        group by p.primary_category_id
      ) x on x.primary_category_id = c.id
      where c.kind = 'primary' and c.is_active
    ), '[]'::jsonb)
  ) end;
$$;

-- Computed field: has the caller asked to follow this profile?
create function public.viewer_has_requested(pr public.profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.follow_requests r where r.target_id = pr.id and r.requester_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Going public approves everyone waiting (as Instagram does).
create function public.profiles_after_privacy_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    insert into public.follows (follower_id, following_id)
    select r.requester_id, r.target_id
    from public.follow_requests r
    where r.target_id = new.id
      and not public.is_blocked_between(r.requester_id, r.target_id)
    on conflict do nothing;
    delete from public.follow_requests where target_id = new.id;
  end if;
  return null;
end;
$$;

create trigger profiles_after_privacy_change
  after update of is_private on public.profiles
  for each row execute function public.profiles_after_privacy_change();

-- Blocking clears requests in both directions, like follows.
create or replace function public.user_blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  delete from public.follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return null;
end;
$$;

revoke all on function public.is_private_account(uuid) from public, anon;
revoke all on function public.counts_toward_stats(uuid, text, text) from public, anon;
revoke all on function public.can_view_content_of(uuid) from public, anon;
revoke all on function public.follow_user(uuid) from public, anon;
revoke all on function public.accept_follow_request(uuid) from public, anon;
revoke all on function public.viewer_has_requested(public.profiles) from public, anon;
revoke all on function public.profiles_after_privacy_change() from public, anon;
grant execute on function public.is_private_account(uuid) to authenticated;
grant execute on function public.counts_toward_stats(uuid, text, text) to authenticated;
grant execute on function public.can_view_content_of(uuid) to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.accept_follow_request(uuid) to authenticated;
grant execute on function public.viewer_has_requested(public.profiles) to authenticated;
