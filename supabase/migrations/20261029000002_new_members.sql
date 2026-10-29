-- New to Cheffy: newly joined members get seen.
--
-- 1. new_members(): every eligible account, newest first, paged. Eligible
--    means a verified email, not suspended or banned, discoverable, not
--    blocked either way, and not already followed, requested or dismissed
--    by the viewer (and never the viewer). Deleted accounts have no profile.
-- 2. suggested_friends(): accounts that joined in the last 30 days now
--    qualify on their own ("New to Cheffy"), so a brand-new cook with no
--    posts or mutual friends can still be suggested. Stronger reasons
--    (mutual follows, follows you, shared interest) still rank first.
--    Suggestions now also require a verified email.
-- Read-only functions; no data changes.

create function public.new_members(p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.created_at
  from public.profiles pr
  join auth.users u on u.id = pr.id
  where auth.uid() is not null
    and pr.id <> auth.uid()
    and pr.discoverable
    and pr.suspended_at is null
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < now())
    and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = pr.id)
    and not exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = pr.id)
    and not exists (select 1 from public.suggestion_dismissals d where d.user_id = auth.uid() and d.dismissed_id = pr.id)
    and not public.is_blocked_between(auth.uid(), pr.id)
  order by pr.created_at desc, pr.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.new_members(integer, integer) from public, anon;
grant execute on function public.new_members(integer, integer) to authenticated;

create or replace function public.suggested_friends(p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, reason text, score integer, mutual_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  my_top as (
    select p.primary_category_id as id
    from public.posts p, me
    where p.author_id = me.id and p.status = 'published'
    group by p.primary_category_id
    order by count(*) desc, p.primary_category_id
    limit 1
  ),
  candidates as (
    select pr.id, pr.created_at > now() - interval '30 days' as is_new
    from public.profiles pr
    join auth.users u on u.id = pr.id
    cross join me
    where pr.id <> me.id
      and pr.discoverable
      and pr.suspended_at is null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and not exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = pr.id)
      and not exists (select 1 from public.follow_requests r where r.requester_id = me.id and r.target_id = pr.id)
      and not exists (select 1 from public.suggestion_dismissals d where d.user_id = me.id and d.dismissed_id = pr.id)
      and not public.is_blocked_between(me.id, pr.id)
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
  follows_me as (
    select f.follower_id as id
    from public.follows f, me
    where f.following_id = me.id and f.follower_id in (select id from candidates)
  ),
  activity as (
    select p.author_id as id,
           count(*) filter (where p.published_at > now() - interval '30 days')::integer as recent,
           count(*) filter (where p.primary_category_id = (select id from my_top))::integer as same_kind
    from public.posts p
    join public.profiles a on a.id = p.author_id and not a.is_private
    where p.author_id in (select id from candidates)
      and p.status = 'published' and p.visibility = 'public'
    group by p.author_id
  ),
  scored as (
    select c.id, c.is_new,
           coalesce(m.n, 0) as mutual_n, m.via,
           fm.id is not null as follows_me,
           coalesce(a.same_kind, 0) >= 2 as same_interest,
           coalesce(a.recent, 0) as recent
    from candidates c
    left join mutual m on m.id = c.id
    left join follows_me fm on fm.id = c.id
    left join activity a on a.id = c.id
  )
  select s.id,
         case
           when s.mutual_n = 1 then 'Followed by @' || s.via
           when s.mutual_n > 1 then 'Followed by @' || s.via || ' and ' || (s.mutual_n - 1)
                                    || ' other' || case when s.mutual_n > 2 then 's' else '' end
           when s.follows_me then 'Follows you'
           when s.same_interest then 'Also loves ' || lower((select k.name from public.categories k where k.id = (select id from my_top)))
           when s.is_new then 'New to Cheffy'
           else 'Active on Cheffy'
         end,
         (least(s.mutual_n, 10) * 30
          + case when s.follows_me then 25 else 0 end
          + case when s.same_interest then 12 else 0 end
          + case when s.is_new then 6 else 0 end
          + least(s.recent, 5))::integer,
         s.mutual_n
  from scored s
  where s.mutual_n > 0 or s.follows_me or s.same_interest or s.recent > 0 or s.is_new
  order by 3 desc, s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
