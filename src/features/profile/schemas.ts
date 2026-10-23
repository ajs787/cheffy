import { z } from 'zod';

import { parseInstagram } from '@/utils/instagram';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'At least 3 characters.')
  .max(24, '24 characters max.')
  .regex(/^[a-z0-9_.]+$/, 'Letters, numbers, dots and underscores only.')
  .refine(
    (v) => !v.startsWith('.') && !v.endsWith('.') && !v.includes('..'),
    'Dots can’t start, end or repeat.',
  );

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'Add your name.').max(50, '50 characters max.'),
  bio: z.string().trim().max(160, '160 characters max.'),
  /** Optional: a username, @username or profile link; stored as a clean username. */
  instagram: z.string().superRefine((value, ctx) => {
    const parsed = parseInstagram(value);
    if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.error });
  }),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/** Suggests a username from an email address: "Audrey.Shin+x@…" → "audrey.shin". */
export function suggestUsername(email: string): string {
  const local = email.split('@')[0]?.split('+')[0] ?? '';
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
  return cleaned.length >= 3 ? cleaned : '';
}
