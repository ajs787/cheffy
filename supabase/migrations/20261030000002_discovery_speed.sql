-- Faster discovery queries.
--
-- trending_creations and newly_cooked ran with the caller's rights, so every
-- post, like and comment they touched re-ran the posts visibility policy
-- (about 0.4 ms a row): ~240 ms and ~90 ms per call with 120 posts, growing
-- with every like. Both only ever return public posts from public accounts,
-- so they now apply that rule once, explicitly (published, public, public and
-- unsuspended author, not blocked either way, not the viewer's own), and
-- Trending starts from the last 14 days of likes and comments instead of
-- every post ever. Same results; the existing privacy tests cover it.
--
-- Indexes for the time-bounded reads: newest members, and recent likes and
-- comments. Small tables today; built without data changes.

create index if not exists profiles_created_idx on public.profiles (created_at desc, id desc);
create index if not exists likes_created_idx on public.likes (created_at);
create index if not exists comments_created_idx on public.comments (created_at);

create or replace function public.trending_creations(p_limit integer default 18, p_offset integer default 0)
returns table (post_id uuid, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  recent_likes as (
    select l.post_id, l.user_id, l.created_at
    from public.likes l
    where l.created_at > now() - interval '14 days'
  ),
  recent_comments as (
    select c.post_id, c.author_id, max(c.created_at) as latest
    from public.comments c
    where c.created_at > now() - interval '14 days'
    group by c.post_id, c.author_id
  ),
  pool as (
    select p.id, p.author_id, p.published_at
    from public.posts p
    join public.profiles a on a.id = p.author_id
    cross join me
    where p.id in (select post_id from recent_likes union select post_id from recent_comments)
      and me.id is not null
      and p.status = 'published'
      and p.visibility = 'public'
      and not a.is_private
      and a.suspended_at is null
      and p.author_id <> me.id
      and not public.is_blocked_between(me.id, p.author_id)
      and exists (select 1 from public.post_images i where i.post_id = p.id)
  ),
  like_score as (
    select l.post_id, sum(case when l.created_at > now() - interval '7 days' then 2 else 1 end) as s
    from recent_likes l
    join pool pl on pl.id = l.post_id
    where l.user_id <> pl.author_id
    group by l.post_id
  ),
  comment_score as (
    select c.post_id, sum(case when c.latest > now() - interval '7 days' then 3 else 2 end) as s
    from recent_comments c
    join pool pl on pl.id = c.post_id
    where c.author_id <> pl.author_id
    group by c.post_id
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

create or replace function public.newly_cooked(p_limit integer default 18, p_offset integer default 0)
returns table (post_id uuid, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  pool as (
    select p.id, p.author_id, p.published_at
    from public.posts p
    join public.profiles a on a.id = p.author_id
    cross join me
    where me.id is not null
      and p.status = 'published'
      and p.visibility = 'public'
      and a.discoverable
      and not a.is_private
      and a.suspended_at is null
      and p.author_id <> me.id
      and not public.is_blocked_between(me.id, p.author_id)
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
