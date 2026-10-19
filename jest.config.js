/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      resolver: 'react-native-reanimated/jest/resolver',
      moduleNameMapper: {
        '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
      },
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|lucide-react-native|react-native-svg|@supabase/.*|standard-navigation))',
      ],
    },
    {
      displayName: 'db',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/db/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
    },
  ],
};
