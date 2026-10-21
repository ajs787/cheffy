-- Classifications v3: many more cuisines, the full baking list, custom
-- labels ("Other / Add custom"), and usage counts so pickers can show common
-- choices first. Additive: existing posts and categories are untouched
-- (except "Cheesecakes" reads "Cheesecake").

-- Profile photos keep their original framing (for viewing enlarged) next to
-- the circle crop. Older photos have only the crop.
alter table public.profiles add column avatar_original_path text;
grant update (avatar_original_path) on public.profiles to authenticated;

alter table public.categories
  add column is_custom boolean not null default false,
  add column created_by uuid references public.profiles (id) on delete set null;

-- Baking, in the order people look for them.
update public.categories c set name = 'Cheesecake'
from public.categories p
where c.parent_id = p.id and p.slug = 'baking' and c.slug = 'cheesecakes';

insert into public.categories (kind, parent_id, slug, name, sort_order)
select 'subcategory', p.id, v.slug, v.name, v.sort_order
from public.categories p
cross join (values
  ('pizza',    'Pizza',    1),
  ('tarts',    'Tarts',    11),
  ('rolls',    'Rolls',    12),
  ('bagels',   'Bagels',   13),
  ('biscuits', 'Biscuits', 14)
) as v(slug, name, sort_order)
where p.kind = 'primary' and p.slug = 'baking'
on conflict (kind, parent_id, slug) do nothing;

update public.categories c set sort_order = v.sort_order
from public.categories p,
  (values ('pizza', 1), ('bread', 2), ('cookies', 3), ('brownies', 4), ('cakes', 5), ('cheesecakes', 6),
          ('muffins', 7), ('pastries', 8), ('pies', 9), ('tarts', 10), ('rolls', 11), ('bagels', 12),
          ('biscuits', 13), ('donuts', 14), ('other', 99)) as v(slug, sort_order)
where c.parent_id = p.id and p.slug = 'baking' and c.slug = v.slug;

-- Cuisines across regions (Turkish included).
insert into public.categories (kind, slug, name, sort_order)
select 'cuisine', v.slug, v.name, 50 from (values
  ('turkish', 'Turkish'), ('lebanese', 'Lebanese'), ('persian', 'Persian'), ('israeli', 'Israeli'),
  ('palestinian', 'Palestinian'), ('syrian', 'Syrian'), ('iraqi', 'Iraqi'), ('egyptian', 'Egyptian'),
  ('moroccan', 'Moroccan'), ('tunisian', 'Tunisian'), ('ethiopian', 'Ethiopian'), ('nigerian', 'Nigerian'),
  ('ghanaian', 'Ghanaian'), ('senegalese', 'Senegalese'), ('south-african', 'South African'),
  ('kenyan', 'Kenyan'), ('filipino', 'Filipino'), ('indonesian', 'Indonesian'), ('malaysian', 'Malaysian'),
  ('singaporean', 'Singaporean'), ('taiwanese', 'Taiwanese'), ('cantonese', 'Cantonese'),
  ('sichuan', 'Sichuan'), ('pakistani', 'Pakistani'), ('bangladeshi', 'Bangladeshi'),
  ('sri-lankan', 'Sri Lankan'), ('nepalese', 'Nepalese'), ('burmese', 'Burmese'), ('cambodian', 'Cambodian'),
  ('lao', 'Lao'), ('mongolian', 'Mongolian'), ('greek', 'Greek'), ('spanish', 'Spanish'),
  ('portuguese', 'Portuguese'), ('german', 'German'), ('british', 'British'), ('irish', 'Irish'),
  ('polish', 'Polish'), ('hungarian', 'Hungarian'), ('ukrainian', 'Ukrainian'), ('russian', 'Russian'),
  ('georgian', 'Georgian'), ('armenian', 'Armenian'), ('scandinavian', 'Scandinavian'), ('dutch', 'Dutch'),
  ('belgian', 'Belgian'), ('swiss', 'Swiss'), ('austrian', 'Austrian'), ('balkan', 'Balkan'),
  ('peruvian', 'Peruvian'), ('brazilian', 'Brazilian'), ('argentinian', 'Argentinian'),
  ('colombian', 'Colombian'), ('venezuelan', 'Venezuelan'), ('cuban', 'Cuban'),
  ('puerto-rican', 'Puerto Rican'), ('dominican', 'Dominican'), ('jamaican', 'Jamaican'),
  ('caribbean', 'Caribbean'), ('salvadoran', 'Salvadoran'), ('southern', 'Southern (US)'),
  ('cajun-creole', 'Cajun & Creole'), ('tex-mex', 'Tex-Mex'), ('hawaiian', 'Hawaiian'),
  ('canadian', 'Canadian'), ('australian', 'Australian'), ('fusion', 'Fusion')
) as v(slug, name)
on conflict (kind, parent_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Custom labels
-- ---------------------------------------------------------------------------

-- Finds or creates a classification for a typed label. Normalization (via
-- slugify) means "Turkish", " turkish " and "TURKISH" all resolve to the same
-- row, built-in or custom. Only optional kinds can be created.
create function public.ensure_custom_category(p_kind text, p_parent uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_slug text := public.slugify(v_name);
  v_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('cuisine', 'subcategory', 'dish_type') then
    raise exception 'custom classifications must be cuisines, subtypes or dish types' using errcode = '22023';
  end if;
  if (p_kind = 'subcategory') <> (p_parent is not null) then
    raise exception 'custom subtypes need a primary category' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 30 or v_slug = '' or v_slug = 'other' then
    raise exception 'custom labels are 2–30 characters' using errcode = '22023';
  end if;

  select id into v_id from public.categories
  where kind = p_kind and parent_id is not distinct from p_parent and slug = v_slug;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.categories (kind, parent_id, slug, name, sort_order, is_custom, created_by)
  values (p_kind, p_parent, v_slug, v_name, 500, true, auth.uid())
  on conflict (kind, parent_id, slug) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.categories
    where kind = p_kind and parent_id is not distinct from p_parent and slug = v_slug;
  end if;
  return v_id;
end;
$$;

-- How often each classification is used (counts only, no post data), so
-- pickers can put common choices first.
create function public.classification_usage(p_kind text)
returns table (category_id uuid, uses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.category_id, count(*)
  from public.post_categories pc
  join public.categories c on c.id = pc.category_id
  join public.posts p on p.id = pc.post_id and p.status = 'published'
  where c.kind = p_kind
  group by pc.category_id;
$$;

drop function public.save_post(jsonb, jsonb, text[], uuid[]);

create function public.save_post(
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

-- save_post runs as the caller, so the caller needs this; it validates input
-- and can only create optional classification labels.
revoke all on function public.ensure_custom_category(text, uuid, text) from public, anon;
grant execute on function public.ensure_custom_category(text, uuid, text) to authenticated;
revoke all on function public.classification_usage(text) from public, anon;
revoke all on function public.save_post(jsonb, jsonb, text[], uuid[], jsonb) from public, anon;
grant execute on function public.classification_usage(text) to authenticated;
grant execute on function public.save_post(jsonb, jsonb, text[], uuid[], jsonb) to authenticated;
