-- Cheffy client-facing functions: computed fields and RPCs.
-- Unless stated otherwise these are SECURITY INVOKER, so the caller's RLS
-- applies to every row they read or write.

-- ---------------------------------------------------------------------------
-- Computed fields (PostgREST exposes `fn(table_row)` as a virtual column).
-- ---------------------------------------------------------------------------
create or replace function public.viewer_has_liked(p public.posts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid());
$$;

create or replace function public.viewer_has_saved(p public.posts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = auth.uid());
$$;

create or replace function public.viewer_is_following(pr public.profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.following_id = pr.id and f.follower_id = auth.uid());
$$;

create or replace function public.viewer_has_blocked(pr public.profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.user_blocks b where b.blocked_id = pr.id and b.blocker_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Feed: published posts by people the caller follows, plus their own.
-- Keyset pagination on (published_at, id).
-- ---------------------------------------------------------------------------
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
    )
    and (p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Search creations by name, tag or any category name.
-- ---------------------------------------------------------------------------
create or replace function public.escape_like(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function public.search_posts(
  p_query     text,
  p_before    timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 20
)
returns setof public.posts
language sql
stable
set search_path = ''
as $$
  with q as (
    select '%' || public.escape_like(lower(btrim(p_query))) || '%' as pattern
  )
  select p.*
  from public.posts p, q
  where char_length(btrim(p_query)) >= 2
    and p.status = 'published'
    and (
      p.title ilike q.pattern
      or exists (
        select 1 from public.post_tags pt join public.tags t on t.id = pt.tag_id
        where pt.post_id = p.id and t.name ilike q.pattern
      )
      or exists (
        select 1 from public.categories c
        where c.id in (p.primary_category_id, p.subcategory_id, p.cuisine_id, p.meal_type_id, p.dish_type_id)
          and c.name ilike q.pattern
      )
    )
    and (p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Discover: browse posts other people made, with optional filters.
--   p_sort 'recent' → keyset on (published_at, id)
--   p_sort 'top'    → rating, offset paging
--   p_sort 'loved'  → like_count (posts with at least one like), offset paging
-- p_category_id matches subcategory, cuisine, meal type or dish type.
-- ---------------------------------------------------------------------------
create or replace function public.discover_posts(
  p_sort           text default 'recent',
  p_primary_id     uuid default null,
  p_category_id    uuid default null,
  p_tag_id         uuid default null,
  p_following_only boolean default false,
  p_since          timestamptz default null,
  p_before         timestamptz default null,
  p_before_id      uuid default null,
  p_offset         integer default 0,
  p_limit          integer default 20
)
returns setof public.posts
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.posts p
  where p.status = 'published'
    and p.author_id <> auth.uid()
    and (p_primary_id is null or p.primary_category_id = p_primary_id)
    and (p_category_id is null
         or p_category_id in (p.subcategory_id, p.cuisine_id, p.meal_type_id, p.dish_type_id))
    and (p_tag_id is null
         or exists (select 1 from public.post_tags pt where pt.post_id = p.id and pt.tag_id = p_tag_id))
    and (not p_following_only
         or exists (select 1 from public.follows f
                    where f.follower_id = auth.uid() and f.following_id = p.author_id))
    and (p_since is null or p.published_at >= p_since)
    and (p_sort <> 'loved' or p.like_count > 0)
    and (p_sort <> 'recent' or p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by
    case when p_sort = 'top' then p.rating end desc nulls last,
    case when p_sort = 'loved' then p.like_count end desc nulls last,
    p.published_at desc,
    p.id desc
  offset case when p_sort = 'recent' then 0 else greatest(coalesce(p_offset, 0), 0) end
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Categories and tags that actually have recent visible posts. Discover
-- builds its sections from this, so it never shows an empty section.
create or replace function public.trending_taxonomy(
  p_since     timestamptz default now() - interval '60 days',
  p_min_posts integer default 2,
  p_limit     integer default 8
)
returns table (kind text, id uuid, slug text, name text, post_count bigint)
language sql
stable
set search_path = ''
as $$
  with visible as (
    select p.id, p.subcategory_id, p.cuisine_id
    from public.posts p
    where p.status = 'published' and p.published_at >= p_since
  ),
  cats as (
    select c.kind, c.id, c.slug, c.name, count(*) as post_count
    from visible v
    join public.categories c on c.id in (v.subcategory_id, v.cuisine_id)
    group by c.kind, c.id, c.slug, c.name
  ),
  tgs as (
    select 'tag'::text as kind, t.id, t.slug, t.name, count(*) as post_count
    from visible v
    join public.post_tags pt on pt.post_id = v.id
    join public.tags t on t.id = pt.tag_id
    group by t.id, t.slug, t.name
  )
  select * from (select * from cats union all select * from tgs) x
  where x.post_count >= p_min_posts
  order by x.post_count desc, x.name asc
  limit least(greatest(coalesce(p_limit, 8), 1), 30);
$$;

-- People the caller doesn't follow yet who have visible posts.
create or replace function public.suggested_cooks(p_limit integer default 10)
returns setof public.profiles
language sql
stable
set search_path = ''
as $$
  select pr.*
  from public.profiles pr
  join lateral (
    select count(*) as n, max(p.published_at) as last_at
    from public.posts p
    where p.author_id = pr.id and p.status = 'published'
  ) s on s.n > 0
  where pr.id <> auth.uid()
    and not public.is_following(auth.uid(), pr.id)
    and not public.is_blocked_between(auth.uid(), pr.id)
  order by s.n desc, s.last_at desc, pr.id
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

-- ---------------------------------------------------------------------------
-- Profile header numbers. Post counts only include posts the caller can see.
-- ---------------------------------------------------------------------------
create or replace function public.profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows f where f.following_id = p_user_id),
    'following', (select count(*) from public.follows f where f.follower_id = p_user_id),
    'posts', (select count(*) from public.posts p where p.author_id = p_user_id and p.status = 'published'),
    'by_primary', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', coalesce(x.n, 0))
                       order by c.sort_order)
      from public.categories c
      left join (
        select p.primary_category_id, count(*) as n
        from public.posts p
        where p.author_id = p_user_id and p.status = 'published'
        group by p.primary_category_id
      ) x on x.primary_category_id = c.id
      where c.kind = 'primary' and c.is_active
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Rankings. Rank is never stored: it's row_number() over the filtered set
-- with a deterministic tie-break (rating ↓, made_on ↓, created_at ↓, id ↓).
-- The rank number always reflects rating order, whatever the display sort.
-- ---------------------------------------------------------------------------
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
    select p.*
    from public.posts p
    where p.author_id = p_user_id
      and p.status = 'published'
      and (p_primary_id is null or p.primary_category_id = p_primary_id)
      and (p_category_id is null
           or p_category_id in (p.subcategory_id, p.cuisine_id, p.meal_type_id, p.dish_type_id))
      and (p_tag_id is null
           or exists (select 1 from public.post_tags pt where pt.post_id = p.id and pt.tag_id = p_tag_id))
  ),
  ranked as (
    select b.*,
           row_number() over (order by b.rating desc, b.made_on desc, b.created_at desc, b.id desc) as rnk,
           count(*) over () as total
    from base b
  )
  select
    r.rnk,
    r.total,
    r.id,
    r.title,
    r.rating,
    r.made_on,
    r.created_at,
    pc.slug,
    pc.name,
    sc.name,
    (select pi.thumb_path from public.post_images pi where pi.post_id = r.id order by pi.position limit 1)
  from ranked r
  join public.categories pc on pc.id = r.primary_category_id
  left join public.categories sc on sc.id = coalesce(r.subcategory_id, r.cuisine_id, r.dish_type_id)
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

-- Filter chips for a ranking: only dimensions the user has actually used.
create or replace function public.ranking_filters(p_user_id uuid)
returns table (kind text, id uuid, slug text, name text, parent_id uuid, post_count bigint)
language sql
stable
set search_path = ''
as $$
  with visible as (
    select p.id, p.subcategory_id, p.cuisine_id, p.meal_type_id, p.dish_type_id
    from public.posts p
    where p.author_id = p_user_id and p.status = 'published'
  )
  select c.kind, c.id, c.slug, c.name, c.parent_id, count(*)
  from visible v
  join public.categories c on c.id in (v.subcategory_id, v.cuisine_id, v.meal_type_id, v.dish_type_id)
  group by c.kind, c.id, c.slug, c.name, c.parent_id, c.sort_order
  union all
  select 'tag', t.id, t.slug, t.name, null::uuid, count(*)
  from visible v
  join public.post_tags pt on pt.post_id = v.id
  join public.tags t on t.id = pt.tag_id
  group by t.id, t.slug, t.name
  order by 1, 6 desc, 4;
$$;

-- ---------------------------------------------------------------------------
-- Save a post, its ordered images and its tags in one transaction.
-- Creates the post when the id is new, otherwise updates it (author only).
--
-- p_post   : jsonb with posts columns (id required, generated by the client
--            so images can be uploaded under the post's folder first)
-- p_images : jsonb array [{id, storage_path, thumb_path, width, height}] in
--            display order
-- p_tags   : tag names; normalized to slugs, max 10
-- ---------------------------------------------------------------------------
create or replace function public.save_post(p_post jsonb, p_images jsonb default '[]'::jsonb, p_tags text[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_row   public.posts := jsonb_populate_record(null::public.posts, p_post);
  v_found boolean;
  v_tags  text[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_row.id is null then
    raise exception 'post id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_images, '[]'::jsonb)) > 6 then
    raise exception 'a post can have at most 6 images' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) e
    where nullif(e ->> 'id', '') is null
  ) then
    raise exception 'every image needs an id' using errcode = '22023';
  end if;
  if v_row.made_on is not null and v_row.made_on > current_date + 1 then
    raise exception 'made_on cannot be in the future' using errcode = '22023';
  end if;

  select true into v_found from public.posts where id = v_row.id;

  if coalesce(v_found, false) then
    update public.posts set
      title               = v_row.title,
      primary_category_id = v_row.primary_category_id,
      subcategory_id      = v_row.subcategory_id,
      cuisine_id          = v_row.cuisine_id,
      meal_type_id        = v_row.meal_type_id,
      dish_type_id        = v_row.dish_type_id,
      rating              = v_row.rating,
      review              = coalesce(v_row.review, ''),
      visibility          = coalesce(v_row.visibility, 'public'),
      status              = coalesce(v_row.status, 'published'),
      made_on             = coalesce(v_row.made_on, current_date),
      would_make_again    = v_row.would_make_again,
      recipe_url          = nullif(btrim(v_row.recipe_url), ''),
      ingredients         = coalesce(v_row.ingredients, ''),
      prep_notes          = coalesce(v_row.prep_notes, ''),
      next_time_notes     = coalesce(v_row.next_time_notes, ''),
      cook_time_minutes   = v_row.cook_time_minutes,
      temperature         = v_row.temperature,
      milk                = nullif(btrim(v_row.milk), ''),
      sweetener           = nullif(btrim(v_row.sweetener), '')
    where id = v_row.id and author_id = v_uid;

    if not found then
      raise exception 'post not found' using errcode = '42501';
    end if;
  else
    insert into public.posts (
      id, author_id, title, primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id,
      rating, review, visibility, status, made_on, would_make_again, recipe_url, ingredients,
      prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener
    ) values (
      v_row.id, v_uid, v_row.title, v_row.primary_category_id, v_row.subcategory_id, v_row.cuisine_id,
      v_row.meal_type_id, v_row.dish_type_id, v_row.rating, coalesce(v_row.review, ''),
      coalesce(v_row.visibility, 'public'), coalesce(v_row.status, 'published'),
      coalesce(v_row.made_on, current_date), v_row.would_make_again, nullif(btrim(v_row.recipe_url), ''),
      coalesce(v_row.ingredients, ''), coalesce(v_row.prep_notes, ''), coalesce(v_row.next_time_notes, ''),
      v_row.cook_time_minutes, v_row.temperature, nullif(btrim(v_row.milk), ''), nullif(btrim(v_row.sweetener), '')
    );
  end if;

  -- Images: drop removed ones, then upsert the rest in display order.
  delete from public.post_images pi
  where pi.post_id = v_row.id
    and pi.id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) e
    );

  insert into public.post_images (id, post_id, storage_path, thumb_path, width, height, position)
  select (e ->> 'id')::uuid, v_row.id, e ->> 'storage_path', e ->> 'thumb_path',
         (e ->> 'width')::integer, (e ->> 'height')::integer, (ord - 1)::smallint
  from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) with ordinality as t(e, ord)
  on conflict (id) do update set position = excluded.position
  where public.post_images.post_id = v_row.id;

  -- Tags: normalize, dedupe, cap at 10.
  select coalesce(array_agg(distinct s), '{}') into v_tags
  from (
    select public.slugify(t) as s from unnest(coalesce(p_tags, '{}')) t
  ) x
  where char_length(s) between 1 and 30;

  if array_length(v_tags, 1) > 10 then
    raise exception 'a post can have at most 10 tags' using errcode = '22023';
  end if;

  insert into public.tags (slug, name, created_by)
  select s, replace(s, '-', ' '), v_uid from unnest(v_tags) s
  on conflict (slug) do nothing;

  delete from public.post_tags pt
  where pt.post_id = v_row.id
    and pt.tag_id not in (select t.id from public.tags t where t.slug = any (v_tags));

  insert into public.post_tags (post_id, tag_id)
  select v_row.id, t.id from public.tags t where t.slug = any (v_tags)
  on conflict do nothing;

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

-- Security definer so it also sees usernames of people who blocked the caller.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
$$;

-- Deletes the caller's auth user; everything they own cascades. The app
-- removes their Storage files through the Storage API before calling this.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- Functions created in this migration get default EXECUTE for PUBLIC/anon on
-- Supabase; the app is sign-in only.
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
