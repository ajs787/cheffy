import { useRef, useState } from 'react';

import { ConfirmationDialog } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';

import { finishAccountDeletion, SessionExpiredError } from '../api';
import { useDeleteAccount } from '../hooks';

const STEPS = [
  {
    title: 'Delete your account?',
    message:
      'This permanently deletes your profile, every post and photo, your rankings, collections, comments and likes. It can’t be undone.',
    confirmLabel: 'Continue',
  },
  {
    title: 'Are you absolutely sure?',
    message: 'Everything you’ve logged on Cheffy will be gone for good.',
    confirmLabel: 'Delete my account',
  },
] as const;

/**
 * Two-step account deletion in ONE sheet (the content changes; the sheet
 * stays up). Swapping between two separate iOS modals mid-animation, or
 * signing out while a modal is still on screen, can freeze the app, so the
 * sign-out happens only after this sheet has fully closed.
 */
export function DeleteAccountSheet({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const deleteAccount = useDeleteAccount();
  const [step, setStep] = useState<0 | 1>(0);
  // Set once the sheet should sign this phone out when it closes: after a
  // deletion, or when the server says the sign-in is no longer valid.
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);
  const current = STEPS[step];

  // Runs once: normally when the sheet reports it has closed, or after a
  // short fallback in case that report never comes.
  const finish = (message: string) => {
    if (finished.current) return;
    finished.current = true;
    void finishAccountDeletion()
      .catch(() => undefined)
      .finally(() => toast.show(message));
  };

  const close = () => {
    onDone();
  };

  return (
    <ConfirmationDialog
      visible={visible}
      title={current.title}
      message={current.message}
      confirmLabel={current.confirmLabel}
      destructive
      error={error}
      onCancel={close}
      onConfirm={async () => {
        if (step === 0) {
          setStep(1);
          return;
        }
        setError(null);
        try {
          await deleteAccount.mutateAsync();
          const message = 'Your account was deleted.';
          setSignOutMessage(message);
          close();
          setTimeout(() => finish(message), 1500);
        } catch (e) {
          if (e instanceof SessionExpiredError) {
            setSignOutMessage(e.message);
            close();
            setTimeout(() => finish(e.message), 1500);
            return;
          }
          setError(toUserMessage(e, 'Couldn’t delete your account. Please try again.'));
        }
      }}
      onClosed={() => {
        setStep(0);
        setError(null);
        if (signOutMessage) finish(signOutMessage);
      }}
    />
  );
}
