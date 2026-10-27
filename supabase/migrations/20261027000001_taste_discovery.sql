-- "For Your Taste" on Discover, and "People you may know" on Find Friends.
--
-- Taste is built from what the viewer makes (weight 3), likes (2) and saves
-- (2): the tags, cuisines, subcategories and main category (Cooking, Baking,
-- Drinks) on those posts. Nothing is learned or stored; it's recomputed per
-- request from rows the viewer can already read.
--
-- Both taste functions are SECURITY INVOKER, so the posts RLS policy decides
-- what they can see: private and followers-only posts the viewer can't open,
-- blocked people (either way), drafts and removed posts never appear, and
-- every count only includes posts the viewer could actually browse.
--
-- Variety: a small per-day jitter (a hash of the id and the date) so the same
-- handful of items doesn't sit on top forever, and at most two creations per
-- cook before anyone's third.

-- ---------------------------------------------------------------------------
-- Topics: tags, cuisines and subcategories (plus Budget Eats) to explore.
-- ---------------------------------------------------------------------------
create function public.taste_topics(p_limit integer default 12)
returns table (kind text, id uuid, slug text, name text, post_count bigint, personal boolean)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  signal_posts as (
    select p.id as post_id, 3 as w from public.posts p, me
    where p.author_id = me.id and p.status = 'published'
    union all
    select l.post_id, 2 from public.likes l, me where l.user_id = me.id
    union all
    select s.post_id, 2 from public.saved_posts s, me where s.user_id = me.id
  ),
  topic_posts as (
    select 'tag'::text as kind, pt.tag_id as id, pt.post_id from public.post_tags pt
    union all
    select c.kind, c.id, pc.post_id
    from public.post_categories pc
    join public.categories c on c.id = pc.category_id and c.kind in ('subcategory', 'cuisine') and c.is_active
  ),
  taste as (
    select tp.kind, tp.id, sum(sp.w)::integer as w
    from signal_posts sp
    join topic_posts tp on tp.post_id = sp.post_id
    group by tp.kind, tp.id
  ),
  -- What there is to browse: other people's published posts the viewer can see.
  pool as (
    select p.id, p.published_at, p.is_budget
    from public.posts p, me
    where p.status = 'published' and p.author_id <> me.id
  ),
  counts as (
    select tp.kind, tp.id, count(*) as n, max(pl.published_at) as latest
    from pool pl
    join topic_posts tp on tp.post_id = pl.id
    group by tp.kind, tp.id
  ),
  topics as (
    select c.kind, c.id,
           coalesce(t.slug, k.slug) as slug,
           coalesce(t.name, k.name) as name,
           c.n, c.latest, coalesce(ta.w, 0) as w
    from counts c
    left join public.tags t on c.kind = 'tag' and t.id = c.id
    left join public.categories k on c.kind <> 'tag' and k.id = c.id
    left join taste ta on ta.kind = c.kind and ta.id = c.id
    union all
    select 'budget'::text, null::uuid, 'budget-eats'::text, 'Budget Eats'::text,
           (select count(*) from pool where is_budget),
           (select max(published_at) from pool where is_budget),
           (select coalesce(sum(sp.w), 0)::integer
            from signal_posts sp join public.posts p on p.id = sp.post_id
            where p.is_budget)
  ),
  scored as (
    select x.*,
           least(x.w, 12) * 4
           + least(x.n, 15)
           + case when x.latest > now() - interval '14 days' then 3 else 0 end
           + abs(hashtext(coalesce(x.id::text, x.kind) || current_date::text)) % 3 as score
    from topics x
    where x.n >= 2 and x.name is not null
  ),
  -- One chip per name: a "Korean" cuisine and a "korean" tag are the same idea.
  deduped as (
    select distinct on (lower(s.name)) s.*
    from scored s
    order by lower(s.name), s.score desc, s.kind
  )
  select d.kind, d.id, d.slug, d.name, d.n, d.w > 0
  from deduped d
  order by d.score desc, d.name
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

revoke all on function public.taste_topics(integer) from public, anon;
grant execute on function public.taste_topics(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Creations: other people's posts that match the viewer's taste, best first.
-- Posts the viewer already liked or saved are left out (they've seen them).
-- ---------------------------------------------------------------------------
create function public.taste_posts(p_limit integer default 10, p_offset integer default 0)
returns table (post_id uuid, score integer)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  signal_posts as (
    select p.id as post_id, 3 as w from public.posts p, me
    where p.author_id = me.id and p.status = 'published'
    union all
    select l.post_id, 2 from public.likes l, me where l.user_id = me.id
    union all
    select s.post_id, 2 from public.saved_posts s, me where s.user_id = me.id
  ),
  topic_posts as (
    select 'tag'::text as kind, pt.tag_id as id, pt.post_id from public.post_tags pt
    union all
    select c.kind, c.id, pc.post_id
    from public.post_categories pc
    join public.categories c on c.id = pc.category_id and c.kind in ('subcategory', 'cuisine')
    union all
    select 'primary', p.primary_category_id, p.id from public.posts p
  ),
  taste as (
    select tp.kind, tp.id, sum(sp.w)::integer as w
    from signal_posts sp
    join topic_posts tp on tp.post_id = sp.post_id
    group by tp.kind, tp.id
  ),
  pool as (
    select p.id, p.author_id, p.rating, p.like_count, p.published_at
    from public.posts p, me
    where p.status = 'published'
      and p.author_id <> me.id
      and p.published_at > now() - interval '365 days'
      and exists (select 1 from public.post_images i where i.post_id = p.id)
      and not exists (select 1 from public.likes l where l.user_id = me.id and l.post_id = p.id)
      and not exists (select 1 from public.saved_posts s where s.user_id = me.id and s.post_id = p.id)
  ),
  overlap as (
    -- The main category counts for less than a specific tag or cuisine.
    select tp.post_id,
           sum(case when tp.kind = 'primary' then least(ta.w, 6) else least(ta.w, 12) end) as w
    from topic_posts tp
    join taste ta on ta.kind = tp.kind and ta.id = tp.id
    where tp.post_id in (select id from pool)
    group by tp.post_id
  ),
  scored as (
    select pl.id, pl.author_id,
           (coalesce(o.w, 0) * 3
            + greatest(coalesce(pl.rating, 0) - 6, 0) * 2
            + least(pl.like_count, 10)
            + case when pl.published_at > now() - interval '14 days' then 4
                   when pl.published_at > now() - interval '60 days' then 2
                   else 0 end
            + abs(hashtext(pl.id::text || current_date::text)) % 4
           )::integer as score
    from pool pl
    left join overlap o on o.post_id = pl.id
  ),
  ranked as (
    select s.*, row_number() over (partition by s.author_id order by s.score desc, s.id) as nth
    from scored s
  )
  select r.id, r.score
  from ranked r
  -- Everyone's best two first, then the rest.
  order by (r.nth > 2), r.score desc, r.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.taste_posts(integer, integer) from public, anon;
grant execute on function public.taste_posts(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- suggested_friends: also return how many people you follow follow them, so
-- Find Friends can show "People you may know" (mutual connections) apart
-- from the top suggestions. Ranking and exclusions are unchanged.
-- ---------------------------------------------------------------------------
drop function public.suggested_friends(integer, integer);

create function public.suggested_friends(p_limit integer default 20, p_offset integer default 0)
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
          + least(s.recent, 5))::integer,
         s.mutual_n
  from scored s
  where s.mutual_n > 0 or s.follows_me or s.same_interest or s.recent > 0
  order by 3 desc, s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.suggested_friends(integer, integer) from public, anon;
grant execute on function public.suggested_friends(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Creation search, most relevant first: exact title, title starts with the
-- query, a word in the title starts with it, title contains it, then tag or
-- category matches; newest first within each tier. SECURITY INVOKER, so only
-- posts the viewer can see are searched (same rule as search_posts).
-- ---------------------------------------------------------------------------
create function public.search_creations(p_query text, p_offset integer default 0, p_limit integer default 18)
returns table (post_id uuid, tier integer)
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(btrim(p_query)) as term,
           public.escape_like(lower(btrim(p_query))) as esc
  ),
  matches as (
    select p.id, p.published_at,
           case
             when lower(p.title) = q.term then 0
             when lower(p.title) like q.esc || '%' then 1
             when lower(p.title) like '% ' || q.esc || '%' then 2
             when lower(p.title) like '%' || q.esc || '%' then 3
             when exists (
               select 1 from public.post_tags pt join public.tags t on t.id = pt.tag_id
               where pt.post_id = p.id and lower(t.name) = q.term
             ) then 4
             else 5
           end as tier
    from public.posts p, q
    where char_length(q.term) >= 2
      and p.status = 'published'
      and (
        p.title ilike '%' || q.esc || '%'
        or exists (
          select 1 from public.post_tags pt join public.tags t on t.id = pt.tag_id
          where pt.post_id = p.id and t.name ilike '%' || q.esc || '%'
        )
        or exists (
          select 1 from public.categories c
          where c.id in (p.primary_category_id, p.meal_type_id) and c.name ilike '%' || q.esc || '%'
        )
        or exists (
          select 1 from public.post_categories pc join public.categories c on c.id = pc.category_id
          where pc.post_id = p.id and c.name ilike '%' || q.esc || '%'
        )
      )
  )
  select m.id, m.tier
  from matches m
  order by m.tier, m.published_at desc, m.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$$;

revoke all on function public.search_creations(text, integer, integer) from public, anon;
grant execute on function public.search_creations(text, integer, integer) to authenticated;
