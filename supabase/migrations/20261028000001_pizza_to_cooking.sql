-- Pizza moves from Baking (kept for sweet bakes and breads) to Cooking.
--
-- Cooking classifies by dish type, so Pizza becomes a Cooking dish type next
-- to Pasta. The old Baking › Pizza subtype is retired (is_active = false),
-- not deleted: posts already tagged with it keep their label, and pickers
-- stop offering it. No post is changed.

-- 1. Pizza as a Cooking dish type, after Pasta.
insert into public.categories (kind, slug, name, sort_order)
values ('dish_type', 'pizza', 'Pizza', 4)
on conflict (kind, parent_id, slug) do update set is_active = true, is_custom = false, sort_order = 4;

update public.categories c set sort_order = v.sort_order
from (values ('soup', 5), ('stew', 6), ('curry', 7), ('salad', 8), ('sandwich', 9), ('dumplings', 10),
             ('stir-fry', 11), ('tacos', 12), ('bowl', 13), ('grilled', 14), ('roast', 15), ('side', 16))
  as v(slug, sort_order)
where c.kind = 'dish_type' and c.slug = v.slug and not c.is_custom;

-- 2. Retire Baking › Pizza.
update public.categories c set is_active = false
from public.categories p
where c.parent_id = p.id and p.kind = 'primary' and p.slug = 'baking'
  and c.kind = 'subcategory' and c.slug = 'pizza';

-- 3. Typing a retired label as "Add your own" no longer brings it back.
create or replace function public.ensure_custom_category(p_kind text, p_parent uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_slug   text := public.slugify(v_name);
  v_id     uuid;
  v_active boolean;
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

  select id, is_active into v_id, v_active from public.categories
  where kind = p_kind and parent_id is not distinct from p_parent and slug = v_slug;
  if v_id is not null then
    if not v_active then
      raise exception '“%” isn’t offered here any more', v_name using errcode = '22023';
    end if;
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
