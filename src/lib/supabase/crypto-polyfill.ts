import * as ExpoCrypto from 'expo-crypto';

/**
 * React Native has no WebCrypto. Supabase Auth's PKCE flow needs
 * `crypto.getRandomValues` (code verifier) and `crypto.subtle.digest`
 * (SHA-256 code challenge); without them it falls back to Math.random and a
 * "plain" challenge. Provide both from expo-crypto's native implementations.
 * Import this before creating the Supabase client.
 */
type DigestInput = Parameters<typeof ExpoCrypto.digest>[1];

interface MinimalCrypto {
  getRandomValues?: typeof ExpoCrypto.getRandomValues;
  subtle?: { digest: (algorithm: string | { name: string }, data: DigestInput) => Promise<ArrayBuffer> };
}

const scope = globalThis as unknown as { crypto?: MinimalCrypto };
const cryptoObject: MinimalCrypto = scope.crypto ?? {};

if (typeof cryptoObject.getRandomValues !== 'function') {
  cryptoObject.getRandomValues = ExpoCrypto.getRandomValues;
}

if (typeof cryptoObject.subtle?.digest !== 'function') {
  cryptoObject.subtle = {
    digest: (algorithm, data) => {
      const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
      if (name !== ExpoCrypto.CryptoDigestAlgorithm.SHA256) {
        return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
      }
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}

scope.crypto = cryptoObject;
