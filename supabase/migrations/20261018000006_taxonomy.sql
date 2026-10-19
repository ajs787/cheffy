-- Cheffy taxonomy reference data. This is product data, not test data, so it
-- ships as a migration. Add categories with new rows — the app renders
-- whatever is here.

insert into public.categories (kind, slug, name, sort_order) values
  ('primary', 'cooking', 'Cooking', 1),
  ('primary', 'baking',  'Baking',  2),
  ('primary', 'drinks',  'Drinks',  3);

-- Baking subcategories
insert into public.categories (kind, parent_id, slug, name, sort_order)
select 'subcategory', p.id, v.slug, v.name, v.sort_order
from public.categories p
cross join (values
  ('cookies',      'Cookies',      1),
  ('cakes',        'Cakes',        2),
  ('muffins',      'Muffins',      3),
  ('bread',        'Bread',        4),
  ('pastries',     'Pastries',     5),
  ('pies',         'Pies',         6),
  ('brownies',     'Brownies',     7),
  ('donuts',       'Donuts',       8),
  ('cheesecakes',  'Cheesecakes',  9),
  ('other',        'Other',        99)
) as v(slug, name, sort_order)
where p.kind = 'primary' and p.slug = 'baking';

-- Drinks subcategories
insert into public.categories (kind, parent_id, slug, name, sort_order)
select 'subcategory', p.id, v.slug, v.name, v.sort_order
from public.categories p
cross join (values
  ('matcha',        'Matcha',        1),
  ('coffee',        'Coffee',        2),
  ('lattes',        'Lattes',        3),
  ('tea',           'Tea',           4),
  ('smoothies',     'Smoothies',     5),
  ('juices',        'Juices',        6),
  ('lemonades',     'Lemonades',     7),
  ('hot-chocolate', 'Hot Chocolate', 8),
  ('other',         'Other',         99)
) as v(slug, name, sort_order)
where p.kind = 'primary' and p.slug = 'drinks';

-- Cuisines (global; the quick pick for Cooking)
insert into public.categories (kind, slug, name, sort_order) values
  ('cuisine', 'korean',         'Korean',         1),
  ('cuisine', 'chinese',        'Chinese',        2),
  ('cuisine', 'japanese',       'Japanese',       3),
  ('cuisine', 'italian',        'Italian',        4),
  ('cuisine', 'mediterranean',  'Mediterranean',  5),
  ('cuisine', 'mexican',        'Mexican',        6),
  ('cuisine', 'indian',         'Indian',         7),
  ('cuisine', 'thai',           'Thai',           8),
  ('cuisine', 'vietnamese',     'Vietnamese',     9),
  ('cuisine', 'american',       'American',       10),
  ('cuisine', 'french',         'French',         11),
  ('cuisine', 'middle-eastern', 'Middle Eastern', 12),
  ('cuisine', 'other',          'Other',          99);

-- Meal types
insert into public.categories (kind, slug, name, sort_order) values
  ('meal_type', 'breakfast', 'Breakfast', 1),
  ('meal_type', 'brunch',    'Brunch',    2),
  ('meal_type', 'lunch',     'Lunch',     3),
  ('meal_type', 'dinner',    'Dinner',    4),
  ('meal_type', 'snack',     'Snack',     5),
  ('meal_type', 'dessert',   'Dessert',   6);

-- Dish types
insert into public.categories (kind, slug, name, sort_order) values
  ('dish_type', 'rice',       'Rice',       1),
  ('dish_type', 'noodles',    'Noodles',    2),
  ('dish_type', 'pasta',      'Pasta',      3),
  ('dish_type', 'soup',       'Soup',       4),
  ('dish_type', 'stew',       'Stew',       5),
  ('dish_type', 'curry',      'Curry',      6),
  ('dish_type', 'salad',      'Salad',      7),
  ('dish_type', 'sandwich',   'Sandwich',   8),
  ('dish_type', 'dumplings',  'Dumplings',  9),
  ('dish_type', 'stir-fry',   'Stir-fry',   10),
  ('dish_type', 'tacos',      'Tacos',      11),
  ('dish_type', 'bowl',       'Bowl',       12),
  ('dish_type', 'grilled',    'Grilled',    13),
  ('dish_type', 'roast',      'Roast',      14),
  ('dish_type', 'side',       'Side',       15),
  ('dish_type', 'other',      'Other',      99);
