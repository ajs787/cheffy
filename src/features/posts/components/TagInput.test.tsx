import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { TagInput } from './TagInput';

jest.mock('@/features/discover/api', () => ({ searchTags: jest.fn(async () => []) }));

function Harness({ onDraft }: { onDraft?: (d: string) => void }) {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TagInput value={tags} onChange={setTags} onDraftChange={onDraft} />
    </QueryClientProvider>
  );
}

describe('TagInput', () => {
  it('commits a typed tag on return', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText('Add a tag');
    await fireEvent.changeText(input, 'Oat Milk');
    await fireEvent(input, 'submitEditing');
    expect(screen.getByText('#oat milk')).toBeOnTheScreen();
    expect(screen.getByText('1/10 tags')).toBeOnTheScreen();
  });

  it('splits comma-separated text into tags only when committed, deduping', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText('Add a tag');
    await fireEvent.changeText(input, 'iced, strawberry,iced');
    expect(screen.queryByText('#iced')).toBeNull();
    await fireEvent(input, 'submitEditing');
    expect(screen.getByText('#iced')).toBeOnTheScreen();
    expect(screen.getByText('#strawberry')).toBeOnTheScreen();
    expect(screen.getByText('2/10 tags')).toBeOnTheScreen();
  });

  it('reports pending text so a submit can include it', async () => {
    const onDraft = jest.fn();
    await render(<Harness onDraft={onDraft} />);
    await fireEvent.changeText(screen.getByLabelText('Add a tag'), 'matcha');
    expect(onDraft).toHaveBeenLastCalledWith('matcha');
  });
});
