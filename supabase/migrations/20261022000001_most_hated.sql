-- "Most Hated": the week's lowest self-rated public creations, for Discover.
-- Ratings are always the creator's own, so the section celebrates honest
-- kitchen disasters rather than judging anyone. Guard rails:
--   * public posts from public, email-verified, settled accounts only
--   * anyone can opt out (profiles.allow_most_hated), and nobody is notified
--   * reported posts are left out; blocked people never see each other
--   * one post per creator, photos required, a rating ceiling, and a minimum
--     number of eligible posts before the section shows at all
-- Tunables live in app_config so they can change without an app release.

create table public.app_config (
  key   text primary key,
  value jsonb not null
);

alter table public.app_config enable row level security;
-- Only security-definer functions read it; clients never do.
revoke all on public.app_config from anon, authenticated;

insert into public.app_config (key, value) values
  ('most_hated.window_days', '7'),
  ('most_hated.min_items', '3'),
  ('most_hated.max_rating', '5.0'),
  ('most_hated.min_account_age_hours', '48'),
  ('most_hated.limit', '10');

create function public.config_number(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_config where key = p_key), p_default);
$$;

revoke all on function public.config_number(text, numeric) from public, anon, authenticated;

-- Opt-out: on by default, switchable in Settings.
alter table public.profiles add column allow_most_hated boolean not null default true;
grant update (allow_most_hated) on public.profiles to authenticated;

create function public.most_hated_posts()
returns setof public.posts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => public.config_number('most_hated.window_days', 7)::integer);
  v_max numeric := public.config_number('most_hated.max_rating', 5.0);
  v_min_age interval := make_interval(hours => public.config_number('most_hated.min_account_age_hours', 48)::integer);
  v_min_items integer := public.config_number('most_hated.min_items', 3)::integer;
  v_limit integer := least(public.config_number('most_hated.limit', 10)::integer, 20);
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  with eligible as (
    select p.id, p.author_id, p.rating, p.published_at,
           -- One post per creator: their lowest of the week.
           row_number() over (
             partition by p.author_id
             order by p.rating asc, p.published_at asc, p.id asc
           ) as per_author
    from public.posts p
    join public.profiles a on a.id = p.author_id
    join auth.users u on u.id = p.author_id
    where p.status = 'published'
      and p.visibility = 'public'
      and p.rating is not null
      and p.rating <= v_max
      and p.published_at >= v_since
      and not a.is_private
      and a.allow_most_hated
      and u.email_confirmed_at is not null
      and u.created_at <= now() - v_min_age
      and exists (select 1 from public.post_images i where i.post_id = p.id)
      and not exists (
        select 1 from public.reports r
        where r.target_post_id = p.id and r.status in ('open', 'actioned')
      )
      and not exists (
        select 1 from public.reports r
        where r.target_user_id = p.author_id and r.status = 'actioned'
      )
      and not public.is_blocked_between(v_uid, p.author_id)
  )
  select array_agg(id order by rating asc, published_at desc, id asc)
  into v_ids
  from (
    select id, rating, published_at from eligible
    where per_author = 1
    order by rating asc, published_at desc, id asc
    limit v_limit
  ) ranked;

  -- Not enough honest disasters yet: show nothing rather than one sad post.
  if coalesce(array_length(v_ids, 1), 0) < v_min_items then
    return;
  end if;

  return query
    select p.* from unnest(v_ids) with ordinality as o(id, n)
    join public.posts p on p.id = o.id
    order by o.n;
end;
$$;

revoke all on function public.most_hated_posts() from public, anon;
grant execute on function public.most_hated_posts() to authenticated;
