-- Ranking experience: head-to-head comparisons, placement celebrations,
-- and friends' rankings.
--
-- Numeric ratings and comparisons stay separate: a comparison never changes
-- a rating. It only orders creations the person rated *the same*, so the
-- ranking still reads top-down by rating.

create table public.ranking_comparisons (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_a     uuid not null references public.posts (id) on delete cascade,
  post_b     uuid not null references public.posts (id) on delete cascade,
  -- 'a' or 'b' preferred, or 'tie'.
  result     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_a, post_b),
  constraint ranking_comparisons_ordered check (post_a < post_b),
  constraint ranking_comparisons_result check (result in ('a', 'b', 'tie'))
);

alter table public.ranking_comparisons enable row level security;
revoke all on public.ranking_comparisons from anon;
grant select, delete on public.ranking_comparisons to authenticated;
create policy ranking_comparisons_select_own on public.ranking_comparisons
  for select to authenticated using (user_id = (select auth.uid()));
create policy ranking_comparisons_delete_own on public.ranking_comparisons
  for delete to authenticated using (user_id = (select auth.uid()));

-- Wins minus losses for one creation in one person's comparisons.
create function public.comparison_score(p_user uuid, p_post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case
    when c.result = 'tie' then 0
    when (c.result = 'a' and c.post_a = p_post) or (c.result = 'b' and c.post_b = p_post) then 1
    else -1 end), 0)::integer
  from public.ranking_comparisons c
  where c.user_id = p_user and (c.post_a = p_post or c.post_b = p_post);
$$;

-- Records "which did you enjoy more?". Both must be the caller's own
-- creations (or accepted collaborations). Answering again replaces it.
create function public.record_comparison(p_preferred uuid, p_other uuid, p_tie boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid := least(p_preferred, p_other);
  v_b uuid := greatest(p_preferred, p_other);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_preferred = p_other
     or (select count(*) from public.creations_of(auth.uid(), false) m where m.post_id in (p_preferred, p_other)) <> 2 then
    raise exception 'compare two of your own creations' using errcode = '22023';
  end if;
  insert into public.ranking_comparisons (user_id, post_a, post_b, result)
  values (auth.uid(), v_a, v_b, case when p_tie then 'tie' when p_preferred = v_a then 'a' else 'b' end)
  on conflict (user_id, post_a, post_b) do update set result = excluded.result, created_at = now();
end;
$$;

-- The best opponent for a head-to-head: the caller's own rated creation in
-- the same primary category with the closest rating (same rating first),
-- within one point, never compared with this one before.
create function public.comparison_candidate(p_post uuid)
returns table (post_id uuid, title text, rating numeric, thumb_path text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  target as (
    select p.id, p.primary_category_id, m.my_rating
    from public.creations_of((select uid from me)) m
    join public.posts p on p.id = m.post_id
    where p.id = p_post and p.status = 'published'
  )
  select p.id, p.title, m.my_rating,
         (select pi.thumb_path from public.post_images pi where pi.post_id = p.id order by pi.position limit 1)
  from public.creations_of((select uid from me)) m
  join public.posts p on p.id = m.post_id
  join target t on t.primary_category_id = p.primary_category_id
  where p.id <> t.id and p.status = 'published'
    and abs(m.my_rating - t.my_rating) <= 1.0
    and not exists (
      select 1 from public.ranking_comparisons c
      where c.user_id = (select uid from me)
        and c.post_a = least(p.id, t.id) and c.post_b = greatest(p.id, t.id)
    )
  order by abs(m.my_rating - t.my_rating), p.made_on desc, p.id
  limit 1;
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
           -- Equal ratings are ordered by the person's own head-to-head picks.
           row_number() over (
             order by b.my_rating desc, public.comparison_score(p_user_id, b.id) desc,
                      b.made_on desc, b.created_at desc, b.id desc
           ) as rnk,
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

-- Where a creation landed in the caller's ranking for its category, and the
-- creation directly below it if that one was there first (the one it
-- "passed"). Celebrations are decided by the app from rank and total.
create function public.ranking_placement(p_post uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_primary uuid;
  v_created timestamptz;
  v_rank bigint;
  v_total bigint;
  v_below record;
begin
  select primary_category_id, created_at into v_primary, v_created from public.posts where id = p_post;
  if v_primary is null then
    return null;
  end if;
  select r.rank, r.total_count into v_rank, v_total
  from public.get_rankings(auth.uid(), v_primary, null, null, 'highest', 100, 0) r
  where r.post_id = p_post;
  if v_rank is null then
    return null;
  end if;
  select r.post_id, r.title, r.created_at into v_below
  from public.get_rankings(auth.uid(), v_primary, null, null, 'highest', 100, 0) r
  where r.rank = v_rank + 1;
  return jsonb_build_object(
    'rank', v_rank,
    'total', v_total,
    'primary_slug', (select slug from public.categories where id = v_primary),
    'primary_name', (select name from public.categories where id = v_primary),
    'passed_post_id', case when v_below.created_at < v_created then v_below.post_id end,
    'passed_title', case when v_below.created_at < v_created then v_below.title end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Friends' rankings (runs as the caller, so RLS hides what they can't see)
-- ---------------------------------------------------------------------------

-- The top creations of everyone the caller follows, per their own rating.
create function public.friends_top_creations(p_primary_id uuid default null, p_per_friend integer default 3)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  post_id      uuid,
  title        text,
  rating       numeric,
  rank         bigint,
  primary_slug text,
  thumb_path   text
)
language sql
stable
set search_path = ''
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_path,
         r.post_id, r.title, r.rating, r.rank, r.primary_slug, r.thumb_path
  from public.follows f
  join public.profiles pr on pr.id = f.following_id
  cross join lateral public.get_rankings(
    f.following_id, p_primary_id, null, null, 'highest', least(greatest(coalesce(p_per_friend, 3), 1), 10), 0
  ) r
  where f.follower_id = auth.uid()
  order by pr.username, r.rank;
$$;

-- Classifications both the caller and a friend loved (rated 8+), with each
-- person's best creation there. Only visible creations count.
create function public.shared_favorites(p_friend uuid, p_limit integer default 6)
returns table (
  category_id  uuid,
  name         text,
  my_post_id   uuid,
  my_title     text,
  my_rating    numeric,
  their_post_id uuid,
  their_title  text,
  their_rating numeric
)
language sql
stable
set search_path = ''
as $$
  with loved as (
    select m.post_id, m.my_rating, p.title, pc.category_id, u.who
    from (values (auth.uid(), 'me'), (p_friend, 'them')) as u(uid, who)
    cross join lateral public.creations_of(u.uid) m
    join public.posts p on p.id = m.post_id and p.status = 'published'
    join public.post_categories pc on pc.post_id = p.id
    where m.my_rating >= 8
  ),
  best as (
    select distinct on (who, category_id) who, category_id, post_id, title, my_rating
    from loved
    order by who, category_id, my_rating desc, post_id
  )
  select c.id, c.name, a.post_id, a.title, a.my_rating, b.post_id, b.title, b.my_rating
  from best a
  join best b on b.category_id = a.category_id and b.who = 'them'
  join public.categories c on c.id = a.category_id
  where a.who = 'me' and p_friend <> auth.uid()
  order by (a.my_rating + b.my_rating) desc, c.name
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

revoke all on function public.comparison_score(uuid, uuid) from public, anon;
revoke all on function public.record_comparison(uuid, uuid, boolean) from public, anon;
revoke all on function public.comparison_candidate(uuid) from public, anon;
revoke all on function public.ranking_placement(uuid) from public, anon;
revoke all on function public.friends_top_creations(uuid, integer) from public, anon;
revoke all on function public.shared_favorites(uuid, integer) from public, anon;
grant execute on function public.comparison_score(uuid, uuid) to authenticated;
grant execute on function public.record_comparison(uuid, uuid, boolean) to authenticated;
grant execute on function public.comparison_candidate(uuid) to authenticated;
grant execute on function public.ranking_placement(uuid) to authenticated;
grant execute on function public.friends_top_creations(uuid, integer) to authenticated;
grant execute on function public.shared_favorites(uuid, integer) to authenticated;
