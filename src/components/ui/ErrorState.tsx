import { CloudOff } from 'lucide-react-native';

import { classifyError, toUserMessage } from '@/lib/errors';

import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ error, title, onRetry, compact }: ErrorStateProps) {
  const kind = classifyError(error);
  return (
    <EmptyState
      icon={CloudOff}
      compact={compact}
      title={
        title ??
        (kind === 'offline'
          ? 'You’re offline'
          : kind === 'unavailable' || kind === 'unreachable' || kind === 'timeout'
            ? 'Can’t reach Cheffy right now'
            : 'Couldn’t load this')
      }
      message={toUserMessage(error, 'Something went wrong on our side. Give it another try.')}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
