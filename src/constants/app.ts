/** App-wide constants. */
/**
 * Support contact shown in Terms and Settings. Apple requires apps with
 * user-generated content to publish a way to contact the developer — set this
 * before submitting to the App Store (see SETUP.md).
 */
export const SUPPORT_EMAIL: string | null = null;

export const TERMS_VERSION = '2026-10-18';

/**
 * Where friends get the app (public TestFlight link now, App Store later).
 * Invites include it when set. Without a web domain, invite links use the
 * cheffy:// scheme, which opens Cheffy only once it's installed.
 */
export const APP_DOWNLOAD_URL: string | null = null;
