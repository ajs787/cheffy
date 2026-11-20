-- Plate: a Cooking dish type for composed meals with several components
-- (say, a protein, vegetables and rice), listed after Bowl.
--
-- Additive only. Dish types are rows in public.categories (no enum or check
-- constraint), and the app reads them live, so no app update is needed. No
-- post is changed. If someone has already typed "Plate" as a custom label,
-- that row is promoted to the built-in option, so there is never a duplicate
-- and posts using it keep it.

insert into public.categories (kind, slug, name, sort_order)
values ('dish_type', 'plate', 'Plate', 14)
on conflict (kind, parent_id, slug) do update
  set name = 'Plate', sort_order = 14, is_custom = false, is_active = true;

-- Make room after Bowl (13).
update public.categories c set sort_order = v.sort_order
from (values ('grilled', 15), ('roast', 16), ('side', 17)) as v(slug, sort_order)
where c.kind = 'dish_type' and c.slug = v.slug and not c.is_custom;
