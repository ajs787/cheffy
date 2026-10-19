import { newPasswordSchema, signInSchema, signUpSchema } from './schemas';

describe('auth schemas', () => {
  it('normalizes email and requires a password to sign in', () => {
    expect(signInSchema.parse({ email: '  Me@Example.COM ', password: 'x' }).email).toBe('me@example.com');
    expect(signInSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('requires 8+ char passwords and accepted terms to sign up', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'short', acceptedTerms: true }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'long enough', acceptedTerms: false }).success).toBe(
      false,
    );
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'long enough', acceptedTerms: true }).success).toBe(
      true,
    );
  });

  it('requires matching new passwords', () => {
    const result = newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgx' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirm']);
  });
});
