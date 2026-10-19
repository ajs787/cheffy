-- Cheffy core schema: tables, constraints, indexes.
-- Security (RLS, grants) lives in 20261018000003_rls.sql.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null,
  display_name text not null,
  bio          text not null default '',
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9_.]{3,24}$' and username !~ '(^\.|\.$|\.\.)'),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_bio_length check (char_length(bio) <= 160),
  constraint profiles_avatar_path_length check (char_length(avatar_path) <= 300)
);

create unique index profiles_username_key on public.profiles (username);
create index profiles_username_trgm_idx on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm_idx on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Taxonomy. One table for every classification dimension so new categories
-- are data, not code. Subcategories hang off a primary category; cuisines,
-- meal types and dish types are global.
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  parent_id  uuid references public.categories (id) on delete restrict,
  slug       text not null,
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint categories_kind_check
    check (kind in ('primary', 'subcategory', 'cuisine', 'meal_type', 'dish_type')),
  constraint categories_parent_rule check ((kind = 'subcategory') = (parent_id is not null)),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_name_length check (char_length(name) between 1 and 40),
  constraint categories_kind_parent_slug_key unique nulls not distinct (kind, parent_id, slug)
);

create index categories_parent_idx on public.categories (parent_id);

-- ---------------------------------------------------------------------------
-- Posts. One row = one specific time someone made something. Making the
-- same cookies three times is three posts.
-- ---------------------------------------------------------------------------
create table public.posts (
  id                  uuid primary key default gen_random_uuid(),
  author_id           uuid not null references public.profiles (id) on delete cascade,
  title               text not null,
  primary_category_id uuid not null,
  subcategory_id      uuid,
  cuisine_id          uuid,
  meal_type_id        uuid,
  dish_type_id        uuid,
  rating              numeric(3, 1),
  review              text not null default '',
  visibility          text not null default 'public',
  status              text not null default 'published',
  made_on             date not null default current_date,
  would_make_again    boolean,
  recipe_url          text,
  ingredients         text not null default '',
  prep_notes          text not null default '',
  next_time_notes     text not null default '',
  cook_time_minutes   integer,
  temperature         text,
  milk                text,
  sweetener           text,
  like_count          integer not null default 0,
  comment_count       integer not null default 0,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint posts_primary_category_id_fkey
    foreign key (primary_category_id) references public.categories (id),
  constraint posts_subcategory_id_fkey
    foreign key (subcategory_id) references public.categories (id),
  constraint posts_cuisine_id_fkey
    foreign key (cuisine_id) references public.categories (id),
  constraint posts_meal_type_id_fkey
    foreign key (meal_type_id) references public.categories (id),
  constraint posts_dish_type_id_fkey
    foreign key (dish_type_id) references public.categories (id),

  constraint posts_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint posts_rating_range check (rating between 0 and 10),
  constraint posts_review_length check (char_length(review) <= 2000),
  constraint posts_visibility_check check (visibility in ('public', 'followers', 'private')),
  constraint posts_status_check check (status in ('draft', 'published')),
  constraint posts_published_requirements
    check (status = 'draft' or (rating is not null and published_at is not null)),
  constraint posts_recipe_url_format
    check (recipe_url is null or (recipe_url ~* '^https?://\S+$' and char_length(recipe_url) <= 500)),
  constraint posts_ingredients_length check (char_length(ingredients) <= 2000),
  constraint posts_prep_notes_length check (char_length(prep_notes) <= 2000),
  constraint posts_next_time_notes_length check (char_length(next_time_notes) <= 1000),
  constraint posts_cook_time_range check (cook_time_minutes between 1 and 2880),
  constraint posts_temperature_check check (temperature in ('hot', 'iced')),
  constraint posts_milk_length check (char_length(milk) <= 40),
  constraint posts_sweetener_length check (char_length(sweetener) <= 40),
  constraint posts_counts_nonnegative check (like_count >= 0 and comment_count >= 0)
);

-- Feed: posts by a set of authors, newest first.
create index posts_feed_idx on public.posts (author_id, published_at desc, id desc)
  where status = 'published';
-- Diary: one author's posts by date made.
create index posts_diary_idx on public.posts (author_id, made_on desc, created_at desc, id desc);
-- Rankings: one author's posts by rating.
create index posts_rankings_idx on public.posts (author_id, rating desc, made_on desc)
  where status = 'published';
-- Discover: recent published posts overall.
create index posts_recent_idx on public.posts (published_at desc, id desc)
  where status = 'published';
create index posts_primary_category_idx on public.posts (primary_category_id, published_at desc)
  where status = 'published';
create index posts_subcategory_idx on public.posts (subcategory_id) where subcategory_id is not null;
create index posts_cuisine_idx on public.posts (cuisine_id) where cuisine_id is not null;
create index posts_meal_type_idx on public.posts (meal_type_id) where meal_type_id is not null;
create index posts_dish_type_idx on public.posts (dish_type_id) where dish_type_id is not null;
create index posts_title_trgm_idx on public.posts using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Post images (ordered). Files live in the private `post-images` bucket.
-- ---------------------------------------------------------------------------
create table public.post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  thumb_path   text not null,
  width        integer not null,
  height       integer not null,
  position     smallint not null,
  created_at   timestamptz not null default now(),
  constraint post_images_storage_path_key unique (storage_path),
  constraint post_images_thumb_path_key unique (thumb_path),
  constraint post_images_dimensions check (width > 0 and height > 0),
  constraint post_images_position_range check (position between 0 and 9),
  constraint post_images_post_position_key unique (post_id, position) deferrable initially deferred
);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null,
  name       text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tags_slug_key unique (slug),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 30),
  constraint tags_name_length check (char_length(name) between 1 and 30)
);

create index tags_name_trgm_idx on public.tags using gin (name extensions.gin_trgm_ops);

create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index post_tags_tag_idx on public.post_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Social graph & interactions
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id, created_at desc);
create index follows_follower_created_idx on public.follows (follower_id, created_at desc);

create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_idx on public.likes (post_id, created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_length check (char_length(btrim(body)) between 1 and 1000)
);

create index comments_post_idx on public.comments (post_id, created_at, id);
create index comments_author_idx on public.comments (author_id);

create table public.saved_posts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index saved_posts_user_idx on public.saved_posts (user_id, created_at desc, post_id);
create index saved_posts_post_idx on public.saved_posts (post_id);

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text not null default '',
  visibility  text not null default 'public',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint collections_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint collections_description_length check (char_length(description) <= 280),
  constraint collections_visibility_check check (visibility in ('public', 'private'))
);

create unique index collections_owner_name_key on public.collections (owner_id, lower(btrim(name)));
create index collections_owner_idx on public.collections (owner_id, updated_at desc);

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  post_id       uuid not null references public.posts (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, post_id)
);

create index collection_items_post_idx on public.collection_items (post_id);
create index collection_items_order_idx on public.collection_items (collection_id, added_at desc);

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references public.profiles (id) on delete set null,
  target_type       text not null,
  target_user_id    uuid references public.profiles (id) on delete set null,
  target_post_id    uuid references public.posts (id) on delete set null,
  target_comment_id uuid references public.comments (id) on delete set null,
  reason            text not null,
  details           text not null default '',
  status            text not null default 'open',
  created_at        timestamptz not null default now(),
  constraint reports_target_type_check check (target_type in ('user', 'post', 'comment')),
  constraint reports_reason_check
    check (reason in ('spam', 'inappropriate', 'harassment', 'not_homemade', 'intellectual_property', 'other')),
  constraint reports_details_length check (char_length(details) <= 500),
  constraint reports_status_check check (status in ('open', 'reviewed', 'actioned', 'dismissed'))
);

create index reports_status_idx on public.reports (status, created_at desc);
