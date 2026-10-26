// moderation-alert: emails Cheffy's moderators when a new report arrives, so
// reports never sit unseen. Called by the reports_after_insert trigger (via
// pg_net) with a shared secret; never by the app.
//
// The email holds no report details (no content, no reporter): just how many
// reports are waiting and a link to the dashboard, which is the source of
// truth. Each report is claimed once (reports.alerted_at), so retries never
// send twice; if sending fails the claim is released and nothing is lost.
//
// Secrets (set with `supabase secrets set`, never in the app):
//   MODERATION_ALERT_SECRET  shared with app_config 'moderation.alert_secret'
//   RESEND_API_KEY           Resend API key with send access for cheffy.me
//   MODERATION_ALERT_FROM    optional, default "Cheffy <no-reply@cheffy.me>"
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const DASHBOARD_URL = 'https://cheffy.me/admin/moderation/';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Constant-time comparison so the secret can't be guessed byte by byte. */
function sameSecret(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const secret = Deno.env.get('MODERATION_ALERT_SECRET') ?? '';
  const given = req.headers.get('x-cheffy-alert-secret') ?? '';
  if (secret.length < 32 || !sameSecret(given, secret)) return json(401, { error: 'unauthorized' });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json(503, { error: 'email not configured' });

  let reportId = '';
  try {
    const body = await req.json();
    reportId = typeof body?.report_id === 'string' ? body.report_id : '';
  } catch {
    // fall through
  }
  if (!UUID.test(reportId)) return json(400, { error: 'bad request' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claim, error: claimError } = await admin.rpc('claim_report_alert', { p_report: reportId });
  if (claimError) {
    console.error('moderation-alert claim failed', claimError.message);
    return json(500, { error: 'claim failed' });
  }
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.claimed) return json(200, { sent: false, reason: 'already alerted' });

  const { data: emails, error: emailsError } = await admin.rpc('moderator_emails');
  const to = (emails ?? []).map((e: { email: string }) => e.email).filter(Boolean);
  if (emailsError || to.length === 0) {
    await admin.rpc('release_report_alert', { p_report: reportId });
    return json(500, { error: 'no moderator email' });
  }

  const pending = Number(row.pending ?? 0);
  const urgent = Number(row.urgent ?? 0);
  const subject = `Cheffy: a new report to review (${pending} pending)`;
  const text = [
    'A new report was filed on Cheffy.',
    '',
    `Pending reports: ${pending}${urgent ? ` (${urgent} marked urgent)` : ''}`,
    '',
    `Review them in the moderation dashboard: ${DASHBOARD_URL}`,
    '',
    'Cheffy’s Terms promise review within about 24 hours.',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MODERATION_ALERT_FROM') ?? 'Cheffy <no-reply@cheffy.me>',
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    console.error('moderation-alert send failed', res.status);
    await admin.rpc('release_report_alert', { p_report: reportId });
    return json(502, { error: 'send failed' });
  }
  return json(200, { sent: true });
});
