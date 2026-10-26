// Public client settings for the moderation dashboard: the project URL and
// the publishable key, the same values shipped inside every Cheffy app build.
// They grant nothing by themselves: every moderation call is checked on the
// server (public.is_moderator()) and row-level security still applies.
// Never put a secret or service-role key here.
window.CHEFFY_ADMIN_CONFIG = {
  supabaseUrl: 'https://yqzycfujpzibzkkdybyu.supabase.co',
  publishableKey: 'sb_publishable_w694oU49tDX3FEuwXcAWvw_sZXHWqZT',
};
