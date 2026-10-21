import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

export const PENDING_INVITE_KEY = 'cheffy-pending-invite';

/**
 * cheffy://invite/CODE — remembers the code and continues. It's only
 * redeemed once this person has a new, verified account with a profile
 * (see useRedeemPendingInvite); opening the link alone credits nobody.
 */
export default function InviteLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const clean = (code ?? '').trim().toUpperCase();
    const save = /^[A-Z0-9]{8}$/.test(clean)
      ? AsyncStorage.setItem(PENDING_INVITE_KEY, clean).catch(() => undefined)
      : Promise.resolve();
    void save.then(() => setSaved(true));
  }, [code]);
  return saved ? <Redirect href="/" /> : null;
}
