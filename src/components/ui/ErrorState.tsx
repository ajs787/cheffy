import { CloudOff } from 'lucide-react-native';

import { isNetworkError, toUserMessage } from '@/lib/errors';

import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ error, title, onRetry, compact }: ErrorStateProps) {
  const offline = isNetworkError(error);
  return (
    <EmptyState
      icon={CloudOff}
      compact={compact}
      title={title ?? (offline ? 'You’re offline' : 'Couldn’t load this')}
      message={toUserMessage(error, 'Something went wrong on our side. Give it another try.')}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
