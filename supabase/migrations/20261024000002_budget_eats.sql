-- Budget Eats: an optional tag for affordable homemade food, with an
-- optional estimated cost per serving (USD cents). Existing posts and
-- ratings are untouched (the tag defaults off).

alter table public.posts
  add column is_budget boolean not null default false,
  add column budget_cost_cents integer,
  -- $0.01 to $1,000 per serving, and only on Budget Eats posts.
  add constraint posts_budget_cost_range check (budget_cost_cents is null or budget_cost_cents between 1 and 100000),
  add constraint posts_budget_cost_needs_tag check (budget_cost_cents is null or is_budget);

grant insert (is_budget, budget_cost_cents), update (is_budget, budget_cost_cents) on public.posts to authenticated;

-- Discover's Budget Eats section: newest / cheapest within the tag.
create index posts_budget_idx on public.posts (budget_cost_cents, published_at desc)
  where is_budget and status = 'published';

create or replace function public.save_post(
  p_post       jsonb,
  p_images     jsonb default '[]'::jsonb,
  p_tags       text[] default '{}',
  p_categories uuid[] default null,
  p_custom     jsonb default null
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
  -- Custom labels ("Other / Add custom"): resolved to a category, reusing
  -- any existing one with the same normalized name.
  if p_custom is not null then
    if jsonb_typeof(p_custom) <> 'array' or jsonb_array_length(p_custom) > 6 then
      raise exception 'at most 6 custom classifications' using errcode = '22023';
    end if;
    v_cats := v_cats || coalesce((
      select array_agg(public.ensure_custom_category(
        e ->> 'kind',
        case when e ->> 'kind' = 'subcategory' then v_row.primary_category_id end,
        e ->> 'label'
      ))
      from jsonb_array_elements(p_custom) e
    ), '{}');
  end if;
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
      sweetener           = nullif(btrim(v_row.sweetener), ''),
      -- Only when the client sends them: older app versions don't know
      -- about Budget Eats and must not erase it when editing a post.
      is_budget           = case when p_post ? 'is_budget' then coalesce(v_row.is_budget, false) else is_budget end,
      budget_cost_cents   = case when p_post ? 'is_budget'
                                 then case when coalesce(v_row.is_budget, false) then v_row.budget_cost_cents end
                                 else budget_cost_cents end
    where id = v_row.id and author_id = v_uid;

    if not found then
      raise exception 'post not found' using errcode = '42501';
    end if;
  else
    insert into public.posts (
      id, author_id, title, primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id,
      rating, review, story, visibility, status, made_on, would_make_again, recipe_url, ingredients,
      prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener,
      is_budget, budget_cost_cents
    ) values (
      v_row.id, v_uid, v_row.title, v_row.primary_category_id, v_row.subcategory_id, v_row.cuisine_id,
      v_row.meal_type_id, v_row.dish_type_id, v_row.rating, coalesce(v_row.review, ''), coalesce(v_row.story, ''),
      coalesce(v_row.visibility, 'public'), coalesce(v_row.status, 'published'),
      coalesce(v_row.made_on, current_date), v_row.would_make_again, nullif(btrim(v_row.recipe_url), ''),
      coalesce(v_row.ingredients, ''), coalesce(v_row.prep_notes, ''), coalesce(v_row.next_time_notes, ''),
      v_row.cook_time_minutes, v_row.temperature, nullif(btrim(v_row.milk), ''), nullif(btrim(v_row.sweetener), ''),
      coalesce(v_row.is_budget, false),
      case when coalesce(v_row.is_budget, false) then v_row.budget_cost_cents end
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

-- Discover gains Budget Eats filters (tag, maximum cost) and a 'cheapest'
-- sort. Same visibility rules: it still runs as the caller under RLS.
drop function public.discover_posts(text, uuid, uuid, uuid, boolean, timestamptz, timestamptz, uuid, integer, integer);

create function public.discover_posts(
  p_sort           text default 'recent',
  p_primary_id     uuid default null,
  p_category_id    uuid default null,
  p_tag_id         uuid default null,
  p_following_only boolean default false,
  p_since          timestamptz default null,
  p_before         timestamptz default null,
  p_before_id      uuid default null,
  p_offset         integer default 0,
  p_limit          integer default 20,
  p_budget         boolean default false,
  p_max_cost_cents integer default null
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
    -- Budget Eats: the tag, and for price filters the stored numeric cost
    -- (posts without an estimate are left out of priced views).
    and (not coalesce(p_budget, false) or p.is_budget)
    and (p_max_cost_cents is null
         or (p.is_budget and p.budget_cost_cents is not null and p.budget_cost_cents <= p_max_cost_cents))
    and (p_sort <> 'cheapest' or (p.is_budget and p.budget_cost_cents is not null))
    and (p_sort <> 'loved' or p.like_count > 0)
    and (p_sort <> 'recent' or p_before is null or (p.published_at, p.id) < (p_before, p_before_id))
  order by
    case when p_sort = 'cheapest' then p.budget_cost_cents end asc nulls last,
    case when p_sort = 'top' then p.rating end desc nulls last,
    case when p_sort = 'loved' then p.like_count end desc nulls last,
    p.published_at desc,
    p.id desc
  offset case when p_sort = 'recent' then 0 else greatest(coalesce(p_offset, 0), 0) end
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.discover_posts(text, uuid, uuid, uuid, boolean, timestamptz, timestamptz, uuid, integer, integer, boolean, integer) from public, anon;
grant execute on function public.discover_posts(text, uuid, uuid, uuid, boolean, timestamptz, timestamptz, uuid, integer, integer, boolean, integer) to authenticated;
