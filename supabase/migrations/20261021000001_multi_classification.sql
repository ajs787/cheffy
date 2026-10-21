-- Multiple classifications per post: a Korean-Italian dish, a cake that is
-- also a cheesecake, a matcha latte. Subcategories, cuisines and dish types
-- live in post_categories (ordered). The single columns on posts stay, kept
-- in sync as each kind's first pick, so existing readers keep working.

create table public.post_categories (
  post_id     uuid not null,
  category_id uuid not null,
  position    smallint not null default 0,
  constraint post_categories_pkey primary key (post_id, category_id),
  constraint post_categories_post_id_fkey
    foreign key (post_id) references public.posts (id) on delete cascade,
  constraint post_categories_category_id_fkey
    foreign key (category_id) references public.categories (id)
);

create index post_categories_category_idx on public.post_categories (category_id);

-- Only optional classifications; a subcategory must belong to the post's primary.
create function public.validate_post_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind    text;
  v_parent  uuid;
  v_primary uuid;
begin
  select c.kind, c.parent_id into v_kind, v_parent from public.categories c where c.id = new.category_id;
  if v_kind is null or v_kind not in ('subcategory', 'cuisine', 'dish_type') then
    raise exception 'classifications must be subcategories, cuisines or dish types' using errcode = '23514';
  end if;
  if v_kind = 'subcategory' then
    select p.primary_category_id into v_primary from public.posts p where p.id = new.post_id;
    if v_parent is distinct from v_primary then
      raise exception 'subcategory must belong to the post''s primary category' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger post_categories_validate
  before insert or update on public.post_categories
  for each row execute function public.validate_post_category();

-- Existing classifications carry over.
insert into public.post_categories (post_id, category_id, position)
select id, subcategory_id, 0 from public.posts where subcategory_id is not null
union all
select id, cuisine_id, 1 from public.posts where cuisine_id is not null
union all
select id, dish_type_id, 2 from public.posts where dish_type_id is not null
on conflict do nothing;

-- Security: readable when the post is (posts RLS), written only by its author.
alter table public.post_categories enable row level security;
revoke all on public.post_categories from anon;
grant select, insert, update, delete on public.post_categories to authenticated;

create policy post_categories_select on public.post_categories
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_categories.post_id));

create policy post_categories_insert_own on public.post_categories
  for insert to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_categories.post_id and p.author_id = (select auth.uid())
  ));

create policy post_categories_update_own on public.post_categories
  for update to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_categories.post_id and p.author_id = (select auth.uid())
  ));

create policy post_categories_delete_own on public.post_categories
  for delete to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_categories.post_id and p.author_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- save_post takes the full classification list (p_categories, in order).
-- ---------------------------------------------------------------------------
drop function public.save_post(jsonb, jsonb, text[]);

create function public.save_post(
  p_post       jsonb,
  p_images     jsonb default '[]'::jsonb,
  p_tags       text[] default '{}',
  p_categories uuid[] default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_row   public.posts := jsonb_populate_record(null::public.posts, p_post);
  v_found boolean;
  v_tags  text[];
  v_cats  uuid[];
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

  -- Classifications: the full ordered list, or (older clients) the single
  -- columns. The single columns keep each kind's first pick.
  v_cats := coalesce(
    p_categories,
    array_remove(array[v_row.subcategory_id, v_row.cuisine_id, v_row.dish_type_id], null)
  );
  select coalesce(array_agg(id order by ord), '{}') into v_cats
  from (
    select distinct on (c) c as id, ord
    from unnest(v_cats) with ordinality as t(c, ord)
    order by c, ord
  ) d;
  if array_length(v_cats, 1) > 12 then
    raise exception 'a post can have at most 12 classifications' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_cats) c
    where not exists (
      select 1 from public.categories k
      where k.id = c and k.kind in ('subcategory', 'cuisine', 'dish_type')
    )
  ) then
    raise exception 'classifications must be subcategories, cuisines or dish types' using errcode = '23514';
  end if;

  -- With a list, the single columns become each kind's first pick. Older
  -- clients' columns are kept as sent, so the posts trigger validates them.
  if p_categories is not null then
    select
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'subcategory' order by o limit 1),
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'cuisine' order by o limit 1),
      (select c from unnest(v_cats) with ordinality t(c, o) join public.categories k on k.id = c
        where k.kind = 'dish_type' order by o limit 1)
    into v_row.subcategory_id, v_row.cuisine_id, v_row.dish_type_id;
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
      story               = coalesce(v_row.story, ''),
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
      rating, review, story, visibility, status, made_on, would_make_again, recipe_url, ingredients,
      prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener
    ) values (
      v_row.id, v_uid, v_row.title, v_row.primary_category_id, v_row.subcategory_id, v_row.cuisine_id,
      v_row.meal_type_id, v_row.dish_type_id, v_row.rating, coalesce(v_row.review, ''), coalesce(v_row.story, ''),
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

  -- Classifications: drop removed ones, then upsert in order.
  delete from public.post_categories pc
  where pc.post_id = v_row.id and pc.category_id <> all (v_cats);

  insert into public.post_categories (post_id, category_id, position)
  select v_row.id, c, (ord - 1)::smallint
  from unnest(v_cats) with ordinality as t(c, ord)
  on conflict (post_id, category_id) do update set position = excluded.position;

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
-- Readers match any of a post's classifications.
-- ---------------------------------------------------------------------------
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
        where c.id in (p.primary_category_id, p.meal_type_id)
          and c.name ilike q.pattern
      )
      or exists (
        select 1 from public.post_categories pc join public.categories c on c.id = pc.category_id
        where pc.post_id = p.id and c.name ilike q.pattern
      )
    )
    and (p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

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
         or p_category_id = p.meal_type_id
         or exists (select 1 from public.post_categories pc
                    where pc.post_id = p.id and pc.category_id = p_category_id))
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
    select p.id
    from public.posts p
    where p.status = 'published' and p.published_at >= p_since
  ),
  cats as (
    select c.kind, c.id, c.slug, c.name, count(*) as post_count
    from visible v
    join public.post_categories pc on pc.post_id = v.id
    join public.categories c on c.id = pc.category_id and c.kind in ('subcategory', 'cuisine')
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
           or p_category_id = p.meal_type_id
           or exists (select 1 from public.post_categories pc
                      where pc.post_id = p.id and pc.category_id = p_category_id))
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
    from public.posts p
    where p.author_id = p_user_id and p.status = 'published'
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

revoke all on function public.save_post(jsonb, jsonb, text[], uuid[]) from public, anon;
revoke all on function public.validate_post_category() from public, anon;
grant execute on function public.save_post(jsonb, jsonb, text[], uuid[]) to authenticated;
