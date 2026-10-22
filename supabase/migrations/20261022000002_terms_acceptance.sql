-- Server-side record of which Terms & Community Guidelines each account
-- accepted. Sign-up passes the version in the auth user's metadata (the
-- checkbox is required there); the profile copies it on creation. Later
-- versions are accepted through accept_terms(). Clients can't write these
-- columns directly.
alter table public.profiles
  add column terms_version text,
  add column terms_accepted_at timestamptz;

create function public.profiles_record_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text;
  v_created timestamptz;
begin
  select u.raw_user_meta_data ->> 'terms_version', u.created_at
    into v_version, v_created
    from auth.users u where u.id = new.id;
  new.terms_version := v_version;
  new.terms_accepted_at := case when v_version is null then null else v_created end;
  return new;
end;
$$;

create trigger profiles_record_terms
  before insert on public.profiles
  for each row execute function public.profiles_record_terms();

create function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_version is null or char_length(p_version) not between 1 and 32 then
    raise exception 'invalid terms version' using errcode = '22023';
  end if;
  update public.profiles
    set terms_version = p_version, terms_accepted_at = now()
    where id = auth.uid();
end;
$$;

revoke all on function public.profiles_record_terms() from public, anon, authenticated;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
