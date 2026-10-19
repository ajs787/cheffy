// jest.mock calls are hoisted above imports, so the module sees the mocks.
import { EncryptedSessionStorage } from './secure-storage';

// In-memory stand-ins for the Keychain (SecureStore) and AsyncStorage.
const mockKeychain = new Map<string, string>();
const mockDisk = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  setItemAsync: jest.fn(async (k: string, v: string) => void mockKeychain.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockKeychain.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockKeychain.delete(k)),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => void mockDisk.set(k, v)),
    getItem: jest.fn(async (k: string) => mockDisk.get(k) ?? null),
    removeItem: jest.fn(async (k: string) => void mockDisk.delete(k)),
  },
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256),
}));

const SESSION = JSON.stringify({ access_token: 'a'.repeat(900), refresh_token: 'r123', user: { id: 'u1' } });

describe('EncryptedSessionStorage', () => {
  beforeEach(() => {
    mockKeychain.clear();
    mockDisk.clear();
  });

  it('round-trips a large session without storing it in plain text', async () => {
    const storage = new EncryptedSessionStorage();
    await storage.setItem('sb-auth', SESSION);
    expect(mockDisk.get('sb-auth')).not.toContain('refresh_token');
    expect(mockKeychain.get('sb-auth')).toHaveLength(64);
    // A fresh instance (app relaunch) reads the same session back.
    await expect(new EncryptedSessionStorage().getItem('sb-auth')).resolves.toBe(SESSION);
  });

  it('returns null when the key is gone, and removes both halves', async () => {
    const storage = new EncryptedSessionStorage();
    await storage.setItem('sb-auth', SESSION);
    mockKeychain.delete('sb-auth');
    await expect(storage.getItem('sb-auth')).resolves.toBeNull();
    await storage.setItem('sb-auth', SESSION);
    await storage.removeItem('sb-auth');
    expect(mockDisk.has('sb-auth')).toBe(false);
    expect(mockKeychain.has('sb-auth')).toBe(false);
  });
});
