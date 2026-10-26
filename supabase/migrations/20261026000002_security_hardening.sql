-- Security hardening from the 2026-10-26 audit (SECURITY_AUDIT.md). Each
-- section names the issue it closes; tests/db/security-audit.test.ts has a
-- regression test for each.

-- ---------------------------------------------------------------------------
-- 1. Profiles: clients may create their profile with ordinary fields only,
--    and may not delete the row. Account deletion goes through the
--    delete-account Edge Function, which deletes the auth user (and the
--    profile with it). Closes: unlock/suspension columns set on insert, and
--    delete-and-recreate removing blocks, report evidence and referrals.
-- ---------------------------------------------------------------------------
revoke insert, delete on public.profiles from authenticated;
grant insert (id, username, display_name, bio, avatar_path, avatar_original_path,
              instagram_username, is_private, discoverable, allow_most_hated)
  on public.profiles to authenticated;
drop policy if exists profiles_delete_own on public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Suspension also blocks edits (e.g. publishing a draft) while an old
--    access token is still valid, not only new posts and comments.
-- ---------------------------------------------------------------------------
create function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null);
$$;

create policy posts_update_not_suspended on public.posts
  as restrictive
  for update to authenticated
  using (not public.is_suspended())
  with check (not public.is_suspended());
create policy comments_update_not_suspended on public.comments
  as restrictive
  for update to authenticated
  using (not public.is_suspended())
  with check (not public.is_suspended());

-- ---------------------------------------------------------------------------
-- 3. Relationship helpers are needed by RLS policies (so they stay
--    executable) but must not answer questions about other people's blocks
--    or Co-Chef invitations. For a signed-in caller who isn't a party they
--    return "not blocked" / no status, which reveals nothing; every policy
--    and trigger calls them with the caller as a party, and service-role or
--    owner code (no auth.uid()) still gets the real answer.
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and v_uid is distinct from a and v_uid is distinct from b then
    return false;
  end if;
  return exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
end;
$$;

create or replace function public.has_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and v_uid is distinct from p_blocker and v_uid is distinct from p_blocked then
    return false;
  end if;
  return exists (
    select 1 from public.user_blocks ub
    where ub.blocker_id = p_blocker and ub.blocked_id = p_blocked
  );
end;
$$;

create or replace function public.collaboration_status(p_post uuid, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and v_uid is distinct from p_user
     and not exists (select 1 from public.posts p where p.id = p_post and p.author_id = v_uid) then
    return null;
  end if;
  return (select c.status from public.post_collaborators c where c.post_id = p_post and c.user_id = p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A block ends Co-Chef access between the two people: the collaboration
--    is marked removed, and a blocked invitee can't accept.
-- ---------------------------------------------------------------------------
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
  delete from public.follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  update public.post_collaborators c
    set status = 'removed'
    from public.posts p
    where p.id = c.post_id
      and c.status in ('pending', 'accepted')
      and ((p.author_id = new.blocker_id and c.user_id = new.blocked_id)
        or (p.author_id = new.blocked_id and c.user_id = new.blocker_id));
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reports: reporters can read what they filed and its status, never the
--    evidence copy, the reviewer or the internal note. (RETURNING needs
--    SELECT, so the evidence can't be read back on insert either.)
-- ---------------------------------------------------------------------------
revoke select on public.reports from authenticated;
grant select (id, reporter_id, target_type, target_user_id, target_post_id, target_comment_id,
              reason, details, status, created_at)
  on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Restoring content closes its reports (dismissed), so the reports that
--    hid it no longer count toward the auto-hide threshold.
-- ---------------------------------------------------------------------------
create or replace function public.moderate(p_target_type text, p_target_id uuid, p_action text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_report_status text;
  v_report uuid := nullif(current_setting('cheffy.moderation_report', true), '')::uuid;
  v_note text := left(coalesce(p_note, ''), 2000);
begin
  if not public.is_moderator() then
    raise exception 'moderators only' using errcode = '42501';
  end if;
  if not (
    (p_target_type in ('post', 'comment') and p_action in ('dismiss', 'remove', 'restore'))
    or (p_target_type = 'user' and p_action in ('dismiss', 'suspend', 'unsuspend'))
  ) then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;

  if p_action = 'remove' and p_target_type = 'post' then
    update public.posts set status = 'removed', removed_at = now(),
      removed_reason = coalesce(nullif(btrim(v_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id and status <> 'draft';
  elsif p_action = 'restore' and p_target_type = 'post' then
    update public.posts set status = 'published', removed_at = null, removed_reason = null
      where id = p_target_id and status = 'removed';
  elsif p_action = 'remove' and p_target_type = 'comment' then
    update public.comments set hidden_at = now(),
      hidden_reason = coalesce(nullif(btrim(v_note), ''), 'Removed for breaking the Community Guidelines')
      where id = p_target_id;
  elsif p_action = 'restore' and p_target_type = 'comment' then
    update public.comments set hidden_at = null, hidden_reason = null where id = p_target_id;
  elsif p_action = 'suspend' then
    v_user := p_target_id;
    if v_user = auth.uid() then
      raise exception 'you can''t suspend yourself' using errcode = '22023';
    end if;
    if exists (select 1 from public.moderators m where m.user_id = v_user) then
      raise exception 'moderators can''t be suspended here' using errcode = '22023';
    end if;
    update public.profiles set suspended_at = now(),
      suspended_reason = coalesce(nullif(btrim(v_note), ''), 'Broke the Community Guidelines')
      where id = v_user;
    update auth.users set banned_until = 'infinity' where id = v_user;
    update public.posts set status = 'removed', removed_at = now(), removed_reason = 'Account suspended'
      where author_id = v_user and status = 'published';
    update public.comments set hidden_at = now(), hidden_reason = 'Account suspended'
      where author_id = v_user and hidden_at is null;
  elsif p_action = 'unsuspend' then
    v_user := p_target_id;
    update public.profiles set suspended_at = null, suspended_reason = null where id = v_user;
    update auth.users set banned_until = null where id = v_user;
    update public.posts set status = 'published', removed_at = null, removed_reason = null
      where author_id = v_user and status = 'removed' and removed_reason = 'Account suspended';
    update public.comments set hidden_at = null, hidden_reason = null
      where author_id = v_user and hidden_reason = 'Account suspended';
  end if;

  -- Close the active reports about this target: removal/suspension resolves
  -- them; dismissal and restoring dismiss them (a moderator has ruled).
  v_report_status := case when p_action in ('remove', 'suspend') then 'actioned' else 'dismissed' end;
  if p_action <> 'unsuspend' then
    update public.reports
      set status = v_report_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
          resolution_note = case when btrim(v_note) <> '' then v_note else resolution_note end
    where status in ('open', 'reviewed') and case p_target_type
      when 'post' then target_post_id = p_target_id
      when 'comment' then target_comment_id = p_target_id
      else target_user_id = p_target_id end;
  end if;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, note, report_id, to_status)
  values (auth.uid(), p_target_type, p_target_id, p_action, v_note, v_report,
          case when p_action = 'unsuspend' then null else v_report_status end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Storage paths are plain relative paths: no "." or ".." segments, no
--    empty segments, safe characters only. Stops crafted paths from steering
--    the moderator dashboard's signed-URL requests (which also validates).
-- ---------------------------------------------------------------------------
create function public.is_safe_storage_path(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    p ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
    and char_length(p) <= 300
  );
$$;

alter table public.post_images
  add constraint post_images_path_format
  check (public.is_safe_storage_path(storage_path) and public.is_safe_storage_path(thumb_path));
alter table public.profiles
  add constraint profiles_avatar_path_format
  check (public.is_safe_storage_path(avatar_path) and public.is_safe_storage_path(avatar_original_path));

-- ---------------------------------------------------------------------------
-- 8. Photos held as evidence by an active report can't be deleted or
--    overwritten by their owner until a moderator closes the report.
--    (Account deletion runs with the service role and still removes them,
--    as the Privacy Policy promises.)
-- ---------------------------------------------------------------------------
create function public.is_report_evidence(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Only answers for the caller's own files.
  select (storage.foldername(p_name))[1] = auth.uid()::text
    and exists (
      select 1 from public.reports r
      where r.status in ('open', 'reviewed')
        and r.target_owner_id = auth.uid()
        and (
          (p_bucket = 'post-images' and r.target_snapshot -> 'images' @> jsonb_build_array(jsonb_build_object('path', p_name))
             or r.target_snapshot -> 'images' @> jsonb_build_array(jsonb_build_object('thumb', p_name)))
          or (p_bucket = 'avatars' and r.target_snapshot ->> 'avatar_path' = p_name)
        )
    );
$$;

create policy storage_objects_keep_report_evidence_delete on storage.objects
  as restrictive
  for delete to authenticated
  using (bucket_id not in ('post-images', 'avatars') or not public.is_report_evidence(bucket_id, name));
create policy storage_objects_keep_report_evidence_update on storage.objects
  as restrictive
  for update to authenticated
  using (bucket_id not in ('post-images', 'avatars') or not public.is_report_evidence(bucket_id, name));

-- ---------------------------------------------------------------------------
-- 9. comparison_score answers only for the caller's own comparisons, or for
--    a creation the caller can see (it orders other people's rankings).
-- ---------------------------------------------------------------------------
create or replace function public.comparison_score(p_user uuid, p_post uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and v_uid is distinct from p_user and not exists (
    select 1 from public.posts p
    where p.id = p_post and public.can_view_post(p.author_id, p.visibility, p.status)
  ) then
    return 0;
  end if;
  return (
    select coalesce(sum(case
      when c.result = 'tie' then 0
      when (c.result = 'a' and c.post_a = p_post) or (c.result = 'b' and c.post_b = p_post) then 1
      else -1 end), 0)::integer
    from public.ranking_comparisons c
    where c.user_id = p_user and (c.post_a = p_post or c.post_b = p_post)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. classification_usage counts only public posts of public accounts, so
--     a custom label can't reveal someone's private or followers-only posts.
-- ---------------------------------------------------------------------------
create or replace function public.classification_usage(p_kind text)
returns table (category_id uuid, uses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.category_id, count(*)
  from public.post_categories pc
  join public.categories c on c.id = pc.category_id
  join public.posts p on p.id = pc.post_id and p.status = 'published' and p.visibility = 'public'
  join public.profiles a on a.id = p.author_id and not a.is_private
  where c.kind = p_kind
  group by pc.category_id;
$$;

-- ---------------------------------------------------------------------------
-- 11. A reply can only be addressed to someone in that thread (the comment's
--     author or another replier); anything else falls back to the parent
--     comment's author. Stops replies being used to notify/push arbitrary
--     users (with the post title) about posts they may not be able to see.
-- ---------------------------------------------------------------------------
create or replace function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments;
  v_thread uuid;
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
  v_thread := coalesce(v_parent.parent_id, v_parent.id);
  new.parent_id := v_thread;
  if new.reply_to_user_id is not null and not exists (
    select 1 from public.comments c
    where (c.id = v_thread or c.parent_id = v_thread) and c.author_id = new.reply_to_user_id
  ) then
    new.reply_to_user_id := v_parent.author_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.is_suspended() from public, anon;
revoke all on function public.is_safe_storage_path(text) from public, anon;
revoke all on function public.is_report_evidence(text, text) from public, anon;
grant execute on function public.is_suspended() to authenticated;
grant execute on function public.is_safe_storage_path(text) to authenticated;
grant execute on function public.is_report_evidence(text, text) to authenticated;
