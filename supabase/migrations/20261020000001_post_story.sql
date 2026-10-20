-- Stories: an optional long-form write-up on an entry (the backstory, the
-- process, what went wrong), separate from the short review.

alter table public.posts add column story text not null default '';
alter table public.posts add constraint posts_story_length check (char_length(story) <= 10000);

grant insert (story) on public.posts to authenticated;
grant update (story) on public.posts to authenticated;

-- save_post gains the story field; everything else is unchanged.
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
