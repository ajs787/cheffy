import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display/400Regular';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState, ToastHost } from '@/components/ui';
import { ConfigurationMissing } from '@/components/shared/ConfigurationMissing';
import { useAuthStore } from '@/features/auth/store';
import { useAuthListener } from '@/features/auth/useAuthListener';
import { useMyProfile } from '@/features/profile/hooks';
import { queryClient } from '@/lib/query/client';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            {fontsLoaded || fontError ? <RootNavigator /> : null}
            <ToastHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Decides which part of the app is reachable:
 * signed out → auth; recovering a password → reset; no profile → onboarding;
 * otherwise the app. Guards live here, in one place.
 */
function RootNavigator() {
  useAuthListener();
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const recoveryMode = useAuthStore((s) => s.recoveryMode);
  const profile = useMyProfile();

  const ready = !isSupabaseConfigured || (initialized && (!session || !profile.isPending));

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!isSupabaseConfigured) return <ConfigurationMissing />;
  if (!ready) return null;

  if (session && profile.isError && profile.data === undefined) {
    return (
      <View style={styles.center}>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </View>
    );
  }

  const signedIn = !!session;
  const hasProfile = !!profile.data;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && recoveryMode}>
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recoveryMode && !hasProfile}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recoveryMode && hasProfile}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
      <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
