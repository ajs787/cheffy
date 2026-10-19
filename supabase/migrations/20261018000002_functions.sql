-- Cheffy functions: helpers used by RLS and triggers.
-- Security definer functions always pin search_path to '' and qualify names.
-- Client-facing RPCs live in 20261018000004_rpc.sql.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- ---------------------------------------------------------------------------
-- Relationship helpers. Security definer because they must see rows the
-- caller's RLS hides (e.g. a block created by someone else).
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

create or replace function public.has_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where ub.blocker_id = p_blocker and ub.blocked_id = p_blocked
  );
$$;

create or replace function public.is_following(p_follower uuid, p_following uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = p_follower and f.following_id = p_following
  );
$$;

-- The single source of truth for post visibility. Every table hanging off
-- posts (images, likes, comments, tags, collection items, storage objects)
-- inherits this rule by requiring that its parent post is selectable.
create or replace function public.can_view_post(p_author_id uuid, p_visibility text, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_author_id = auth.uid() then true
    when p_status <> 'published' then false
    when public.is_blocked_between(auth.uid(), p_author_id) then false
    when p_visibility = 'public' then true
    when p_visibility = 'followers' then public.is_following(auth.uid(), p_author_id)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Post triggers
-- ---------------------------------------------------------------------------

-- published_at is owned by the database: set on first publish, kept on
-- later edits, cleared when a post goes back to draft. Clients cannot write
-- it (see column grants in the RLS migration).
create or replace function public.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);

  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.published_at is not null then
      new.published_at := old.published_at;
    else
      new.published_at := coalesce(new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

-- Every taxonomy reference must point at the right kind of category, and a
-- subcategory must belong to the post's primary category.
create or replace function public.posts_validate_taxonomy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent uuid;
begin
  select c.kind into v_kind from public.categories c where c.id = new.primary_category_id;
  if v_kind is distinct from 'primary' then
    raise exception 'primary_category_id must reference a primary category' using errcode = '23514';
  end if;

  if new.subcategory_id is not null then
    select c.kind, c.parent_id into v_kind, v_parent from public.categories c where c.id = new.subcategory_id;
    if v_kind is distinct from 'subcategory' or v_parent is distinct from new.primary_category_id then
      raise exception 'subcategory_id must be a subcategory of the primary category' using errcode = '23514';
    end if;
  end if;

  if new.cuisine_id is not null
     and not exists (select 1 from public.categories c where c.id = new.cuisine_id and c.kind = 'cuisine') then
    raise exception 'cuisine_id must reference a cuisine' using errcode = '23514';
  end if;

  if new.meal_type_id is not null
     and not exists (select 1 from public.categories c where c.id = new.meal_type_id and c.kind = 'meal_type') then
    raise exception 'meal_type_id must reference a meal type' using errcode = '23514';
  end if;

  if new.dish_type_id is not null
     and not exists (select 1 from public.categories c where c.id = new.dish_type_id and c.kind = 'dish_type') then
    raise exception 'dish_type_id must reference a dish type' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

create trigger posts_validate_taxonomy
  before insert or update of primary_category_id, subcategory_id, cuisine_id, meal_type_id, dish_type_id
  on public.posts
  for each row execute function public.posts_validate_taxonomy();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
create trigger comments_set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Denormalized counters so feed reads never aggregate. Security definer
-- because a liker/commenter cannot (and must not) update the post row.
-- ---------------------------------------------------------------------------
create or replace function public.likes_update_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.comments_update_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger likes_update_count after insert or delete on public.likes
  for each row execute function public.likes_update_count();
create trigger comments_update_count after insert or delete on public.comments
  for each row execute function public.comments_update_count();

-- ---------------------------------------------------------------------------
-- Safety triggers
-- ---------------------------------------------------------------------------

-- Blocking someone severs the follow relationship in both directions.
create or replace function public.user_blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return null;
end;
$$;

create trigger user_blocks_after_insert after insert on public.user_blocks
  for each row execute function public.user_blocks_after_insert();

-- Reports must point at what they report. A CHECK can't express this because
-- targets are set null when the reported content is later deleted.
create or replace function public.reports_validate_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.target_type = 'user' and new.target_user_id is null)
     or (new.target_type = 'post' and new.target_post_id is null)
     or (new.target_type = 'comment' and new.target_comment_id is null) then
    raise exception 'report target is missing' using errcode = '23514';
  end if;
  new.status := 'open';
  return new;
end;
$$;

create trigger reports_validate_target before insert on public.reports
  for each row execute function public.reports_validate_target();
