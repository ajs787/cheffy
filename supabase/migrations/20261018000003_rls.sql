-- Cheffy Row Level Security and privileges.
--
-- Principles
-- * The app is sign-in only: `anon` gets nothing.
-- * Post visibility is decided by public.can_view_post(); child tables defer
--   to it by requiring `exists (select 1 from posts where id = post_id)`,
--   which is itself filtered by the posts policy.
-- * Counters, published_at and ownership columns are protected with
--   column-level grants, so clients physically cannot write them.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant usage on schema public to authenticated;

grant select, insert, delete on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_path) on public.profiles to authenticated;

grant select on public.categories to authenticated;

grant select, delete on public.posts to authenticated;
grant insert (
  id, author_id, title, primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id,
  rating, review, visibility, status, made_on, would_make_again, recipe_url, ingredients,
  prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener
) on public.posts to authenticated;
grant update (
  title, primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id,
  rating, review, visibility, status, made_on, would_make_again, recipe_url, ingredients,
  prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener
) on public.posts to authenticated;

grant select, insert, delete on public.post_images to authenticated;
grant update (position) on public.post_images to authenticated;

grant select, insert on public.tags to authenticated;
grant select, insert, delete on public.post_tags to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant select, insert, delete on public.saved_posts to authenticated;
grant select, insert, delete on public.collections to authenticated;
grant update (name, description, visibility) on public.collections to authenticated;
grant select, insert, delete on public.collection_items to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, target_user_id, target_post_id, target_comment_id, reason, details)
  on public.reports to authenticated;

grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.posts            enable row level security;
alter table public.post_images      enable row level security;
alter table public.tags             enable row level security;
alter table public.post_tags        enable row level security;
alter table public.follows          enable row level security;
alter table public.likes            enable row level security;
alter table public.comments         enable row level security;
alter table public.saved_posts      enable row level security;
alter table public.collections      enable row level security;
alter table public.collection_items enable row level security;
alter table public.user_blocks      enable row level security;
alter table public.reports          enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles: visible to everyone signed in, except to people the owner blocked.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (not public.has_blocked(id, (select auth.uid())));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Taxonomy: read-only reference data.
-- ---------------------------------------------------------------------------
create policy categories_select on public.categories
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create policy posts_select_visible on public.posts
  for select to authenticated
  using (public.can_view_post(author_id, visibility, status));

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Post images: visible with the post; only the author manages them, and
-- only with files stored under the author's own storage folder.
-- ---------------------------------------------------------------------------
create policy post_images_select on public.post_images
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_images.post_id));

create policy post_images_insert_own on public.post_images
  for insert to authenticated
  with check (
    exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = (select auth.uid()))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and split_part(thumb_path, '/', 1) = (select auth.uid())::text
  );

create policy post_images_update_own on public.post_images
  for update to authenticated
  using (exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = (select auth.uid())));

create policy post_images_delete_own on public.post_images
  for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Tags: global vocabulary anyone can extend; post_tags follow the post.
-- ---------------------------------------------------------------------------
create policy tags_select on public.tags
  for select to authenticated
  using (true);

create policy tags_insert on public.tags
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy post_tags_select on public.post_tags
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_tags.post_id));

create policy post_tags_insert_own on public.post_tags
  for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_tags.post_id and p.author_id = (select auth.uid())));

create policy post_tags_delete_own on public.post_tags
  for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_tags.post_id and p.author_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Follows: the graph is public to signed-in users. You can only create your
-- own follows, never toward someone in a block relationship with you. You
-- can remove your follows and remove your followers.
-- ---------------------------------------------------------------------------
create policy follows_select on public.follows
  for select to authenticated
  using (true);

create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked_between(follower_id, following_id)
  );

create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------
create policy likes_select on public.likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = likes.post_id));

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = likes.post_id and p.status = 'published')
  );

create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Comments: hidden between blocked users; the post author can moderate.
-- ---------------------------------------------------------------------------
create policy comments_select on public.comments
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = comments.post_id)
    and not public.is_blocked_between((select auth.uid()), author_id)
  );

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = comments.post_id and p.status = 'published')
  );

create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy comments_delete_own_or_post_author on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = comments.post_id and p.author_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Saved posts: completely private to the saver.
-- ---------------------------------------------------------------------------
create policy saved_posts_select_own on public.saved_posts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_posts_insert_own on public.saved_posts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = saved_posts.post_id)
  );

create policy saved_posts_delete_own on public.saved_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create policy collections_select on public.collections
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (visibility = 'public' and not public.is_blocked_between((select auth.uid()), owner_id))
  );

create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy collections_update_own on public.collections
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy collections_delete_own on public.collections
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy collection_items_select on public.collection_items
  for select to authenticated
  using (
    exists (select 1 from public.collections c where c.id = collection_items.collection_id)
    and exists (select 1 from public.posts p where p.id = collection_items.post_id)
  );

create policy collection_items_insert_own on public.collection_items
  for insert to authenticated
  with check (
    exists (select 1 from public.collections c
            where c.id = collection_items.collection_id and c.owner_id = (select auth.uid()))
    and exists (select 1 from public.posts p where p.id = collection_items.post_id)
  );

create policy collection_items_delete_own on public.collection_items
  for delete to authenticated
  using (
    exists (select 1 from public.collections c
            where c.id = collection_items.collection_id and c.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Blocks: private to the blocker.
-- ---------------------------------------------------------------------------
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reports: write-only for users (they can see what they filed). Review
-- happens with the service role in the Supabase dashboard.
-- ---------------------------------------------------------------------------
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));
