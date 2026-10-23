-- Optional, unverified Instagram username shown as a link on the profile.
-- Only a clean username is stored (the app builds the URL itself); the check
-- mirrors Instagram's rules so nothing else can be saved through the API.
alter table public.profiles
  add column instagram_username text,
  add constraint profiles_instagram_username_format check (
    instagram_username is null
    or (instagram_username ~ '^[a-z0-9._]{1,30}$'
        and instagram_username !~ '^\.' and instagram_username !~ '\.$' and instagram_username !~ '\.\.')
  );

grant update (instagram_username) on public.profiles to authenticated;
