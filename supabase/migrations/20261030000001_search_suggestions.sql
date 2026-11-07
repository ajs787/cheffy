-- Search suggestions: what the Search screen's Creations and Tags tabs show
-- before anything is typed.
--
-- 1. trending_creations(): public creations ranked by recent engagement
--    (likes and comments in the last 14 days, the last 7 counting double),
--    not lifetime likes.
-- 2. newly_cooked(): recent creations from discoverable accounts, each
--    cook's newest first, so new cooks get seen next to prolific ones.
-- 3. tag_suggestions(): three deduplicated tag lists in one call:
--    'suggested' (the viewer's interests), 'popular' (recent usage) and
--    'explore' (popular tags outside the viewer's usual ones).
--
-- All three are SECURITY INVOKER, like taste_posts / taste_topics, so the
-- posts RLS policy decides what they can see: private and followers-only
-- posts the viewer can't open, blocked people (either way), drafts and
-- removed posts never appear, and counts only include posts the viewer can
-- browse. The viewer's own creations are never returned. Read-only; no data
-- changes.

-- ---------------------------------------------------------------------------
-- Trending: engagement in the last 14 days from people other than the cook.
-- Likes count 2 (last 7 days) or 1; distinct commenters count 3 or 2.
-- Hidden comments are already invisible through RLS. At most two creations
-- per cook before anyone's third.
-- ---------------------------------------------------------------------------
create function public.trending_creations(p_limit integer default 18, p_offset integer default 0)
returns table (post_id uuid, score integer)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  pool as (
    select p.id, p.author_id, p.published_at
    from public.posts p
    join public.profiles a on a.id = p.author_id
    cross join me
    where p.status = 'published'
      and p.visibility = 'public'
      and not a.is_private
      and a.suspended_at is null
      and p.author_id <> me.id
      and exists (select 1 from public.post_images i where i.post_id = p.id)
  ),
  like_score as (
    select l.post_id,
           sum(case when l.created_at > now() - interval '7 days' then 2 else 1 end) as s
    from public.likes l
    join pool pl on pl.id = l.post_id
    where l.created_at > now() - interval '14 days'
      and l.user_id <> pl.author_id
    group by l.post_id
  ),
  comment_score as (
    select x.post_id, sum(case when x.latest > now() - interval '7 days' then 3 else 2 end) as s
    from (
      select c.post_id, c.author_id, max(c.created_at) as latest
      from public.comments c
      join pool pl on pl.id = c.post_id
      where c.created_at > now() - interval '14 days'
        and c.author_id <> pl.author_id
      group by c.post_id, c.author_id
    ) x
    group by x.post_id
  ),
  scored as (
    select pl.id, pl.author_id, pl.published_at,
           (coalesce(ls.s, 0) + coalesce(cs.s, 0))::integer as score
    from pool pl
    left join like_score ls on ls.post_id = pl.id
    left join comment_score cs on cs.post_id = pl.id
  ),
  ranked as (
    select s.*, row_number() over (partition by s.author_id order by s.score desc, s.published_at desc, s.id) as nth
    from scored s
    where s.score > 0
  )
  select r.id, r.score
  from ranked r
  order by (r.nth > 2), r.score desc, r.published_at desc, r.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$$;

revoke all on function public.trending_creations(integer, integer) from public, anon;
grant execute on function public.trending_creations(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Newly Cooked: public creations from the last 90 days by discoverable,
-- public, unsuspended accounts. Every cook's newest creation comes first
-- (newest first), then everyone's earlier ones.
-- ---------------------------------------------------------------------------
create function public.newly_cooked(p_limit integer default 18, p_offset integer default 0)
returns table (post_id uuid, published_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  pool as (
    select p.id, p.author_id, p.published_at
    from public.posts p
    join public.profiles a on a.id = p.author_id
    cross join me
    where p.status = 'published'
      and p.visibility = 'public'
      and a.discoverable
      and not a.is_private
      and a.suspended_at is null
      and p.author_id <> me.id
      and p.published_at > now() - interval '90 days'
      and exists (select 1 from public.post_images i where i.post_id = p.id)
  ),
  ranked as (
    select pl.*, row_number() over (partition by pl.author_id order by pl.published_at desc, pl.id desc) as nth
    from pool pl
  )
  select r.id, r.published_at
  from ranked r
  order by (r.nth > 1), r.published_at desc, r.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$$;

revoke all on function public.newly_cooked(integer, integer) from public, anon;
grant execute on function public.newly_cooked(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Tag suggestions. Interest weights per post: the viewer's own published
-- posts 3 (5 when rated 8+), likes 2, saves 2, comments 1, and recent posts
-- by people the viewer follows 1 (so a new cook who follows people still
-- gets something). Only tags with at least one browsable post by someone
-- else are returned, so every row opens a non-empty Browse screen.
--   suggested: tags the viewer is into, strongest first.
--   popular:   most used recently (14 days counts most, then 60 days).
--   explore:   popular tags the viewer has no history with (2+ posts),
--              lightly shuffled per day.
-- A tag appears in at most one section, in that priority order.
-- ---------------------------------------------------------------------------
create function public.tag_suggestions(
  p_suggested integer default 8,
  p_popular   integer default 12,
  p_explore   integer default 6
)
returns table (section text, id uuid, slug text, name text, post_count bigint, personal boolean)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  signal_posts as (
    select p.id as post_id, case when p.rating >= 8 then 5 else 3 end as w
    from public.posts p, me
    where p.author_id = me.id and p.status = 'published'
    union all
    select l.post_id, 2 from public.likes l, me where l.user_id = me.id
    union all
    select s.post_id, 2 from public.saved_posts s, me where s.user_id = me.id
    union all
    select distinct c.post_id, 1 from public.comments c, me where c.author_id = me.id
    union all
    select p.id, 1
    from public.follows f
    join public.posts p on p.author_id = f.following_id
    cross join me
    where f.follower_id = me.id
      and p.status = 'published'
      and p.published_at > now() - interval '90 days'
  ),
  taste as (
    select pt.tag_id, sum(sp.w)::integer as w
    from signal_posts sp
    join public.post_tags pt on pt.post_id = sp.post_id
    group by pt.tag_id
  ),
  usage as (
    select pt.tag_id,
           count(*) as n,
           count(*) filter (where p.published_at > now() - interval '14 days') as n14,
           count(*) filter (where p.published_at > now() - interval '60 days') as n60,
           count(distinct p.author_id) as authors
    from public.posts p
    join public.post_tags pt on pt.post_id = p.id
    cross join me
    where p.status = 'published' and p.author_id <> me.id
    group by pt.tag_id
  ),
  base as (
    select t.id, t.slug, t.name, u.n, coalesce(ta.w, 0) as w,
           (least(u.n14, 20) * 4 + least(u.n60, 30) * 2 + least(u.n, 20) + least(u.authors, 10) * 2) as pop
    from usage u
    join public.tags t on t.id = u.tag_id
    left join taste ta on ta.tag_id = u.tag_id
  ),
  suggested as (
    select b.*, row_number() over (order by least(b.w, 15) * 4 + least(b.pop, 40) desc, b.name) as rk
    from base b
    where b.w > 0
    order by rk
    limit least(greatest(coalesce(p_suggested, 8), 0), 30)
  ),
  popular as (
    select b.*, row_number() over (order by b.pop desc, b.name) as rk
    from base b
    where b.id not in (select s.id from suggested s)
    order by rk
    limit least(greatest(coalesce(p_popular, 12), 0), 30)
  ),
  explore as (
    select b.*, row_number() over (
             order by b.pop + abs(hashtext(b.id::text || current_date::text)) % 6 desc, b.name
           ) as rk
    from base b
    where b.w = 0 and b.n >= 2
      and b.id not in (select s.id from suggested s)
      and b.id not in (select p.id from popular p)
    order by rk
    limit least(greatest(coalesce(p_explore, 6), 0), 30)
  )
  select x.section, x.id, x.slug, x.name, x.n, x.w > 0
  from (
    select 'suggested'::text as section, 1 as ord, s.rk, s.id, s.slug, s.name, s.n, s.w from suggested s
    union all
    select 'popular', 2, p.rk, p.id, p.slug, p.name, p.n, p.w from popular p
    union all
    select 'explore', 3, e.rk, e.id, e.slug, e.name, e.n, e.w from explore e
  ) x
  order by x.ord, x.rk;
$$;

revoke all on function public.tag_suggestions(integer, integer, integer) from public, anon;
grant execute on function public.tag_suggestions(integer, integer, integer) to authenticated;
