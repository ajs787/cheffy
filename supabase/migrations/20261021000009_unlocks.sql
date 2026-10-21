-- Minimal milestone unlocks, all decided by the database from verified
-- events. Four only — no XP, levels, streaks or badge walls:
--   theme_saffron  — 3 published creations     → a profile colour theme
--   frame_host     — 2 verified referrals       → a profile photo frame
--   made_together  — first accepted collaboration → a subtle mark
--   recap          — 10 published creations    → a personal cooking recap
-- Unlocks are idempotent (one row each, never revoked) and nothing basic is
-- ever gated behind them.

create table public.profile_unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  unlock      text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, unlock),
  constraint profile_unlocks_kind check (unlock in ('theme_saffron', 'frame_host', 'made_together', 'recap'))
);

alter table public.profile_unlocks enable row level security;
revoke all on public.profile_unlocks from anon;
grant select on public.profile_unlocks to authenticated;
-- Anyone who can see the profile can see its distinctions; only the
-- database writes them.
create policy profile_unlocks_select on public.profile_unlocks
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_unlocks.user_id));

-- Chosen style, shown to everyone who sees the profile.
alter table public.profiles
  add column theme text,
  add column frame text,
  add constraint profiles_theme check (theme is null or theme in ('saffron')),
  add constraint profiles_frame check (frame is null or frame in ('host'));

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------
create table public.invite_codes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  constraint invite_codes_format check (code ~ '^[A-Z0-9]{8}$')
);

-- One row per referred account, ever. Private: only the database reads it;
-- people see their own count, never who joined.
create table public.referrals (
  referred_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint referrals_not_self check (referred_id <> referrer_id)
);

create index referrals_referrer_idx on public.referrals (referrer_id);

alter table public.invite_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on public.invite_codes from anon, authenticated;
revoke all on public.referrals from anon, authenticated;

-- The caller's personal code (created on first request).
create function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select code into v_code from public.invite_codes where user_id = auth.uid();
  while v_code is null loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    if char_length(v_code) = 8 then
      insert into public.invite_codes (user_id, code) values (auth.uid(), v_code)
      on conflict do nothing;
      select code into v_code from public.invite_codes where user_id = auth.uid();
    else
      v_code := null;
    end if;
  end loop;
  return v_code;
end;
$$;

-- A new account credits the friend who invited them. Credit needs a real,
-- verified, new account that finished signing up — tapping a link alone
-- never counts, and nobody can be credited twice.
create function public.redeem_invite_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_created timestamptz;
  v_confirmed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select user_id into v_referrer from public.invite_codes where code = upper(btrim(coalesce(p_code, '')));
  if v_referrer is null then
    raise exception 'that invite code isn''t valid' using errcode = 'P0002';
  end if;
  if v_referrer = auth.uid() then
    raise exception 'you can''t use your own invite code' using errcode = '22023';
  end if;
  select created_at, email_confirmed_at into v_created, v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then
    raise exception 'confirm your email first' using errcode = '22023';
  end if;
  if v_created < now() - interval '14 days' then
    raise exception 'invite codes are for new accounts' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'finish setting up your profile first' using errcode = '22023';
  end if;
  if exists (select 1 from public.referrals where referred_id = auth.uid()) then
    raise exception 'you''ve already used an invite code' using errcode = '22023';
  end if;
  -- No referring each other back, and nothing across a block.
  if exists (select 1 from public.referrals where referred_id = v_referrer and referrer_id = auth.uid())
     or public.is_blocked_between(v_referrer, auth.uid()) then
    raise exception 'that invite code can''t be used' using errcode = '22023';
  end if;
  insert into public.referrals (referred_id, referrer_id) values (auth.uid(), v_referrer);
  perform public.refresh_unlocks(v_referrer);
end;
$$;

-- ---------------------------------------------------------------------------
-- Evaluating unlocks
-- ---------------------------------------------------------------------------
create function public.refresh_unlocks(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creations integer;
begin
  select count(*) into v_creations from public.posts where author_id = p_user and status = 'published';
  if v_creations >= 3 then
    insert into public.profile_unlocks (user_id, unlock) values (p_user, 'theme_saffron') on conflict do nothing;
  end if;
  if v_creations >= 10 then
    insert into public.profile_unlocks (user_id, unlock) values (p_user, 'recap') on conflict do nothing;
  end if;
  if (select count(*) from public.referrals where referrer_id = p_user) >= 2 then
    insert into public.profile_unlocks (user_id, unlock) values (p_user, 'frame_host') on conflict do nothing;
  end if;
  -- Made together: you co-created (accepted) or someone accepted yours.
  if exists (select 1 from public.post_collaborators c where c.user_id = p_user and c.status = 'accepted')
     or exists (select 1 from public.post_collaborators c join public.posts p on p.id = c.post_id
                where p.author_id = p_user and c.status = 'accepted') then
    insert into public.profile_unlocks (user_id, unlock) values (p_user, 'made_together') on conflict do nothing;
  end if;
end;
$$;

create function public.posts_refresh_unlocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    perform public.refresh_unlocks(new.author_id);
  end if;
  return null;
end;
$$;

create trigger posts_refresh_unlocks
  after insert or update of status on public.posts
  for each row execute function public.posts_refresh_unlocks();

create function public.collaborators_refresh_unlocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' then
    perform public.refresh_unlocks(new.user_id);
    perform public.refresh_unlocks((select author_id from public.posts where id = new.post_id));
  end if;
  return null;
end;
$$;

create trigger post_collaborators_refresh_unlocks
  after insert or update of status on public.post_collaborators
  for each row execute function public.collaborators_refresh_unlocks();

-- The caller's unlocks with progress toward the rest (also backfills
-- anything earned before unlocks existed).
create function public.my_unlocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.refresh_unlocks(auth.uid());
  return jsonb_build_object(
    'unlocked', coalesce((select jsonb_agg(unlock order by unlocked_at) from public.profile_unlocks where user_id = auth.uid()), '[]'::jsonb),
    'creations', (select count(*) from public.posts where author_id = auth.uid() and status = 'published'),
    'referrals', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'collaborations', (select count(*) from public.post_collaborators c
                       left join public.posts p on p.id = c.post_id
                       where c.status = 'accepted' and (c.user_id = auth.uid() or p.author_id = auth.uid()))
  );
end;
$$;

-- Applies a theme/frame; each must be unlocked (null clears it).
create function public.set_profile_style(p_theme text, p_frame text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_theme is not null and not exists (
    select 1 from public.profile_unlocks where user_id = auth.uid() and unlock = 'theme_' || p_theme
  ) then
    raise exception 'that theme isn''t unlocked yet' using errcode = '42501';
  end if;
  if p_frame is not null and not exists (
    select 1 from public.profile_unlocks where user_id = auth.uid() and unlock = 'frame_' || p_frame
  ) then
    raise exception 'that frame isn''t unlocked yet' using errcode = '42501';
  end if;
  update public.profiles set theme = p_theme, frame = p_frame where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Cooking recap: real aggregates only, for the owner, once unlocked.
-- ---------------------------------------------------------------------------
create function public.cooking_recap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profile_unlocks where user_id = v_uid and unlock = 'recap') then
    raise exception 'your recap unlocks at 10 creations' using errcode = '42501';
  end if;
  return (
    with mine as (
      select p.*, m.my_rating
      from public.creations_of(v_uid) m
      join public.posts p on p.id = m.post_id and p.status = 'published'
    )
    select jsonb_build_object(
      'total', (select count(*) from mine),
      'average', (select round(avg(my_rating), 1) from mine),
      'first_made_on', (select min(made_on) from mine),
      'by_primary', coalesce((
        select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', x.n) order by x.n desc, c.sort_order)
        from (select primary_category_id, count(*) as n from mine group by primary_category_id) x
        join public.categories c on c.id = x.primary_category_id
      ), '[]'::jsonb),
      'top', (
        select jsonb_build_object('post_id', id, 'title', title, 'rating', my_rating)
        from mine order by my_rating desc, made_on desc limit 1
      ),
      'cuisines', coalesce((
        select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc, name)
        from (
          select c.name, count(*) as n
          from mine m join public.post_categories pc on pc.post_id = m.id
          join public.categories c on c.id = pc.category_id and c.kind = 'cuisine'
          group by c.name
          order by count(*) desc, c.name
          limit 3
        ) t
      ), '[]'::jsonb),
      'cuisine_tagged', (
        select count(distinct m.id) from mine m join public.post_categories pc on pc.post_id = m.id
        join public.categories c on c.id = pc.category_id and c.kind = 'cuisine'
      )
    )
  );
end;
$$;

revoke all on function public.my_invite_code() from public, anon;
revoke all on function public.redeem_invite_code(text) from public, anon;
revoke all on function public.refresh_unlocks(uuid) from public, anon, authenticated;
revoke all on function public.posts_refresh_unlocks() from public, anon, authenticated;
revoke all on function public.collaborators_refresh_unlocks() from public, anon, authenticated;
revoke all on function public.my_unlocks() from public, anon;
revoke all on function public.set_profile_style(text, text) from public, anon;
revoke all on function public.cooking_recap() from public, anon;
grant execute on function public.my_invite_code() to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
grant execute on function public.my_unlocks() to authenticated;
grant execute on function public.set_profile_style(text, text) to authenticated;
grant execute on function public.cooking_recap() to authenticated;
