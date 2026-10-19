import { Settings2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

/** Shown in development builds made without Supabase env vars. */
export function ConfigurationMissing() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon={Settings2}
        title="Cheffy isn’t connected yet"
        message="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local (see SETUP.md), then restart the dev server."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
