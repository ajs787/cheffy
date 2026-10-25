-- Smarter "Suggested for you": a discoverability opt-out, shared cooking
-- interests as a signal, and paging for the full list.
--
-- Signals, strongest first (each label is only shown when it's true):
--   people you follow follow them  → "Followed by @x" / "Followed by @x and N others"
--   they follow you                → "Follows you"
--   you both mostly make the same  → "Also loves baking"
--   recent public posts            → "Active on Cheffy"
-- Never suggested: yourself, people you follow or asked to follow, anyone
-- blocked either way, suspended accounts, people you dismissed, and people
-- who turned off "Suggest my account".

alter table public.profiles add column discoverable boolean not null default true;
grant update (discoverable) on public.profiles to authenticated;

drop function public.suggested_friends(integer);

create function public.suggested_friends(p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, reason text, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  -- What I make most (by my published posts).
  my_top as (
    select p.primary_category_id as id
    from public.posts p, me
    where p.author_id = me.id and p.status = 'published'
    group by p.primary_category_id
    order by count(*) desc, p.primary_category_id
    limit 1
  ),
  candidates as (
    select pr.id
    from public.profiles pr, me
    where pr.id <> me.id
      and pr.discoverable
      and pr.suspended_at is null
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
  -- Public posts only: never reveal what a private account makes.
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
    select c.id,
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
           else 'Active on Cheffy'
         end,
         (least(s.mutual_n, 10) * 30
          + case when s.follows_me then 25 else 0 end
          + case when s.same_interest then 12 else 0 end
          + least(s.recent, 5))::integer
  from scored s
  where s.mutual_n > 0 or s.follows_me or s.same_interest or s.recent > 0
  order by 3 desc, s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.suggested_friends(integer, integer) from public, anon;
grant execute on function public.suggested_friends(integer, integer) to authenticated;

-- Opting out of suggestions doesn't hide you from people who search for
-- your name or username.
