-- Find Friends: paged people search, explainable suggestions, and
-- per-person dismissals. Everything runs as the caller, so row-level
-- security still hides blocked people both ways.

-- ---------------------------------------------------------------------------
-- Search by username or display name, best matches first, paged.
-- ---------------------------------------------------------------------------
create function public.search_profiles(p_query text, p_offset integer default 0, p_limit integer default 20)
returns setof public.profiles
language sql
stable
set search_path = ''
as $$
  with q as (
    select t.term,
           -- % and _ are literal characters in a search, not wildcards.
           replace(replace(replace(t.term, '\', '\\'), '%', '\%'), '_', '\_') as pat
    from (select lower(btrim(coalesce(p_query, ''))) as term) t
  )
  select p.*
  from public.profiles p, q
  where char_length(q.term) between 1 and 50
    and p.id <> auth.uid()
    and p.suspended_at is null
    -- Profiles stay viewable by the person who blocked them (so they can
    -- unblock), but neither side should find the other in search.
    and not public.is_blocked_between(auth.uid(), p.id)
    and (p.username like '%' || q.pat || '%' or lower(p.display_name) like '%' || q.pat || '%')
  order by
    (p.username = q.term) desc,
    (p.username like q.pat || '%') desc,
    (lower(p.display_name) like q.pat || '%') desc,
    p.username
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Partial matches stay fast as Cheffy grows (username already has a
-- trigram index; display names are matched lowercased).
create index profiles_display_name_lower_trgm_idx on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- "Not interested" on a suggestion. Private to the person who dismissed.
-- ---------------------------------------------------------------------------
create table public.suggestion_dismissals (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  dismissed_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, dismissed_id),
  constraint suggestion_dismissals_not_self check (user_id <> dismissed_id)
);

alter table public.suggestion_dismissals enable row level security;
revoke all on public.suggestion_dismissals from anon;
grant select, insert, delete on public.suggestion_dismissals to authenticated;
create policy suggestion_dismissals_own on public.suggestion_dismissals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Suggestions with a reason people can understand, strongest first:
--   1. they follow you and you don't follow back       → "Follows you"
--   2. people you follow follow them (friends of friends) → "Followed by @x" / "… and N others"
--   3. otherwise, active home cooks                      → "Active on Cheffy"
-- Never: yourself, people you follow or have asked to follow, blocked
-- either way, suspended, or anyone you dismissed.
-- ---------------------------------------------------------------------------
create function public.suggested_friends(p_limit integer default 20)
returns table (user_id uuid, reason text, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  candidates as (
    select p.id
    from public.profiles p, me
    where p.id <> me.id
      and p.suspended_at is null
      and not exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = p.id)
      and not exists (select 1 from public.follow_requests r where r.requester_id = me.id and r.target_id = p.id)
      and not exists (select 1 from public.suggestion_dismissals d where d.user_id = me.id and d.dismissed_id = p.id)
      and not public.is_blocked_between(me.id, p.id)
  ),
  follows_me as (
    select c.id from candidates c, me
    where exists (select 1 from public.follows f where f.follower_id = c.id and f.following_id = me.id)
  ),
  mutual as (
    select f2.following_id as id, count(*)::integer as n,
           (array_agg(pr.username order by f2.created_at desc))[1] as via
    from me
    join public.follows f1 on f1.follower_id = me.id
    join public.follows f2 on f2.follower_id = f1.following_id
    join public.profiles pr on pr.id = f1.following_id
    where f2.following_id in (select id from candidates)
    group by f2.following_id
  ),
  active as (
    select c.id, count(p.id)::integer as posts
    from candidates c
    join public.posts p on p.author_id = c.id and p.status = 'published' and p.visibility = 'public'
    group by c.id
  )
  select c.id,
         case
           when fm.id is not null then 'Follows you'
           when m.n = 1 then 'Followed by @' || m.via
           when m.n > 1 then 'Followed by @' || m.via || ' and ' || (m.n - 1) || ' other' || case when m.n > 2 then 's' else '' end
           else 'Active on Cheffy'
         end,
         (case when fm.id is not null then 100 else 0 end + coalesce(m.n, 0) * 10 + least(coalesce(a.posts, 0), 9))::integer
  from candidates c
  left join follows_me fm on fm.id = c.id
  left join mutual m on m.id = c.id
  left join active a on a.id = c.id
  where fm.id is not null or m.id is not null or a.id is not null
  order by 3 desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_profiles(text, integer, integer) from public, anon;
revoke all on function public.suggested_friends(integer) from public, anon;
grant execute on function public.search_profiles(text, integer, integer) to authenticated;
grant execute on function public.suggested_friends(integer) to authenticated;
