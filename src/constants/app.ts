/** App-wide constants. */
/**
 * Support contact shown in Terms and Settings. Apple requires apps with
 * user-generated content to publish a way to contact the developer — set this
 * before submitting to the App Store (see SETUP.md).
 */
export const SUPPORT_EMAIL: string | null = 'hello@cheffy.me';

export const TERMS_VERSION = '2026-10-18';

/**
 * Where friends get the app (public TestFlight link now, App Store later).
 * Invites include it when set.
 */
export const APP_DOWNLOAD_URL: string | null = null;

/**
 * Cheffy's website. Its links open the app directly when it's installed
 * (Universal Links, `associatedDomains` in app.json) and show a web page with
 * the invite code and a download link when it isn't.
 */
export const WEB_URL = 'https://cheffy.me';

/** Public policy pages, also used as the App Store privacy policy URL. */
export const PRIVACY_URL = `${WEB_URL}/privacy`;
export const TERMS_URL = `${WEB_URL}/terms`;

/**
 * The introductory tagline on the welcome screen. The cheffy.me hero
 * (web/index.html) uses the same two lines; keep them in step.
 */
export const TAGLINE = {
  headline: 'Your kitchen has a fan club now.',
  subline: 'Cook it. Rate it. Share it.',
} as const;
