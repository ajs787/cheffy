import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, radii, spacing } from '@/theme';

import { useRedeemInviteCode } from '../hooks';

/** "Joined because of a friend?" — new accounts credit who invited them. */
export function RedeemInviteCode() {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const redeem = useRedeemInviteCode();
  const valid = /^[A-Z0-9]{8}$/.test(code.trim().toUpperCase());

  if (redeem.isSuccess) {
    return (
      <AppText variant="callout" color="textSecondary" align="center" style={styles.done}>
        Thanks — your friend has been credited.
      </AppText>
    );
  }
  return (
    <View style={styles.container}>
      <AppText variant="overline" color="textSecondary">
        Joined because of a friend?
      </AppText>
      <View style={styles.row}>
        <TextInput
          ref={input}
          onChangeText={setCode}
          placeholder="Their invite code"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel="Friend's invite code"
          style={styles.input}
        />
        <AppButton
          label="Apply"
          size="sm"
          variant="secondary"
          disabled={!valid}
          loading={redeem.isPending}
          onPress={() => redeem.mutate(code.trim().toUpperCase())}
        />
      </View>
      <AppText variant="caption" color="textTertiary">
        For new accounts (first two weeks), once.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.text,
    fontSize: 16,
    letterSpacing: 2,
    color: colors.text,
  },
  done: { paddingTop: spacing.lg },
});
