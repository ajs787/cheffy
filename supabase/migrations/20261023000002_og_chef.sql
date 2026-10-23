-- "OG Chef": a permanent tag for Cheffy's first ten accounts.
--
--   * Order is the server's auth.users.created_at, then user id as tie-break.
--   * Eligible = confirmed email and a finished profile (an abandoned,
--     unconfirmed sign-up is not an account anyone uses).
--   * Ten numbered slots, each filled once. If an OG account is later
--     deleted its slot stays used (user_id becomes null) — nothing is
--     redistributed. Clients can read the tag but never write it.
--   * Backfill: the eligible accounts that exist now, in creation order.
--     Any slots left are filled by the next accounts to finish sign-up.

create table public.og_chefs (
  slot       smallint primary key,
  user_id    uuid unique references public.profiles (id) on delete set null,
  awarded_at timestamptz not null default now(),
  constraint og_chefs_slot_range check (slot between 1 and 10)
);

alter table public.og_chefs enable row level security;
revoke all on public.og_chefs from anon, authenticated;
grant select on public.og_chefs to authenticated;
create policy og_chefs_select on public.og_chefs for select to authenticated using (true);

-- Gives the next free slot to an eligible account (no-op once all ten are used).
create function public.award_og_chef(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot smallint;
begin
  -- One award at a time, so two sign-ups can't take the same slot.
  lock table public.og_chefs in share row exclusive mode;
  if exists (select 1 from public.og_chefs where user_id = p_user) then
    return;
  end if;
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = p_user and u.email_confirmed_at is not null
  ) then
    return;
  end if;
  select s into v_slot
  from generate_series(1, 10) s
  where not exists (select 1 from public.og_chefs o where o.slot = s)
  order by s limit 1;
  if v_slot is not null then
    insert into public.og_chefs (slot, user_id) values (v_slot, p_user);
  end if;
end;
$$;

-- Backfill, oldest first.
do $$
declare
  r record;
begin
  for r in
    select u.id from auth.users u join public.profiles p on p.id = u.id
    where u.email_confirmed_at is not null
    order by u.created_at, u.id
  loop
    perform public.award_og_chef(r.id);
  end loop;
end;
$$;

-- New accounts: their profile is created after the email is confirmed.
create function public.profiles_award_og_chef()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.og_chefs) < 10 then
    perform public.award_og_chef(new.id);
  end if;
  return null;
end;
$$;

create trigger profiles_award_og_chef
  after insert on public.profiles
  for each row execute function public.profiles_award_og_chef();

revoke all on function public.award_og_chef(uuid) from public, anon, authenticated;
revoke all on function public.profiles_award_og_chef() from public, anon, authenticated;
