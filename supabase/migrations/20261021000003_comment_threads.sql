-- Comment likes and one level of replies.
--
-- Replies point at a top-level comment (parent_id) and may name the person
-- they answer (reply_to_user_id, shown as "@name"). Replying to a reply
-- attaches to the same top-level comment, so threads never nest deeper.
-- like_count / reply_count are kept by triggers and can't be written by
-- clients.

alter table public.comments
  add column parent_id uuid references public.comments (id) on delete cascade,
  add column reply_to_user_id uuid references public.profiles (id) on delete set null,
  add column like_count integer not null default 0,
  add column reply_count integer not null default 0;

create index comments_parent_idx on public.comments (parent_id, created_at, id) where parent_id is not null;
create index comments_top_level_idx on public.comments (post_id, created_at, id) where parent_id is null;

-- Clients may only write these columns (counts are the database's).
revoke insert on public.comments from authenticated;
grant insert (post_id, author_id, body, parent_id, reply_to_user_id) on public.comments to authenticated;

-- A reply belongs to a top-level comment on the same post.
create function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments;
begin
  if new.parent_id is null then
    new.reply_to_user_id := null;
    return new;
  end if;
  select * into v_parent from public.comments where id = new.parent_id;
  if v_parent.id is null or v_parent.post_id <> new.post_id then
    raise exception 'reply must belong to a comment on the same post' using errcode = '23514';
  end if;
  -- Replying to a reply joins the same thread.
  if v_parent.parent_id is not null then
    new.parent_id := v_parent.parent_id;
  end if;
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function public.comments_before_insert();

create function public.comments_update_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.comments set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.comments set reply_count = greatest(reply_count - 1, 0) where id = old.parent_id;
  end if;
  return null;
end;
$$;

create trigger comments_update_reply_count
  after insert or delete on public.comments
  for each row execute function public.comments_update_reply_count();

-- ---------------------------------------------------------------------------
-- Comment likes
-- ---------------------------------------------------------------------------
create table public.comment_likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index comment_likes_comment_idx on public.comment_likes (comment_id);

create function public.comment_likes_update_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger comment_likes_update_count
  after insert or delete on public.comment_likes
  for each row execute function public.comment_likes_update_count();

alter table public.comment_likes enable row level security;
revoke all on public.comment_likes from anon;
grant select, insert, delete on public.comment_likes to authenticated;

-- Visible (and likeable) exactly when the comment is.
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_likes.comment_id));

create policy comment_likes_insert_own on public.comment_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.comments c where c.id = comment_likes.comment_id)
  );

create policy comment_likes_delete_own on public.comment_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Computed field for the client.
create function public.viewer_has_liked_comment(c public.comments)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()
  );
$$;

revoke all on function public.comments_before_insert() from public, anon;
revoke all on function public.comments_update_reply_count() from public, anon;
revoke all on function public.comment_likes_update_count() from public, anon;
revoke all on function public.viewer_has_liked_comment(public.comments) from public, anon;
grant execute on function public.viewer_has_liked_comment(public.comments) to authenticated;
