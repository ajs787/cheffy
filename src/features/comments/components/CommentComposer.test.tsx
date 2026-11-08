import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';

import { CommentComposer } from './CommentComposer';

const mockMutateAsync = jest.fn();
let mockSuggestions: { data: unknown[]; isFetching: boolean } = { data: [], isFetching: false };
const mockSuggestionQuery = jest.fn();
let mockAnonStatus: { available: boolean; open: boolean; name: string | null } = {
  available: false,
  open: false,
  name: null,
};

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));
jest.mock('../hooks', () => ({
  useAddComment: () => ({ mutateAsync: mockMutateAsync }),
  useMentionSuggestions: (query: string | null) => {
    mockSuggestionQuery(query);
    return mockSuggestions;
  },
}));
jest.mock('../anonymous', () => ({
  ...jest.requireActual('../anonymous'),
  useAnonymousTakesStatus: () => mockAnonStatus,
}));
jest.mock('@/features/profile/hooks', () => ({
  useMyProfile: () => ({ data: { id: 'me', username: 'me', displayName: 'Me', avatarUrl: null } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@/components/ui', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    AppText: Text,
    Avatar: () => null,
    ActionSheet: ({
      visible,
      actions,
    }: {
      visible: boolean;
      actions: { key: string; label: string; onPress: () => void }[];
    }) =>
      visible ? (
        <View>
          {actions.map((a) => (
            <Text key={a.key} onPress={a.onPress}>
              {a.label}
            </Text>
          ))}
        </View>
      ) : null,
  };
});

const ana = { id: 'id-ana', username: 'ana', displayName: 'Ana Ruiz', avatarUrl: null, relation: 'mutual' };

const setup = async () => {
  const inputRef = createRef<ComponentRef<typeof TextInput>>();
  const onSent = jest.fn();
  await render(<CommentComposer postId="p" inputRef={inputRef} onSent={onSent} />);
  const input = () => screen.getByTestId('comment-input');
  const type = async (text: string) => {
    await fireEvent.changeText(input(), text);
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
  };
  return { input, type, onSent };
};

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockSuggestionQuery.mockReset();
  mockSuggestions = { data: [], isFetching: false };
  mockAnonStatus = { available: false, open: false, name: null };
});

describe('CommentComposer mentions', () => {
  it('opens suggestions on @, inserts the pick, and sends its id', async () => {
    mockSuggestions = { data: [ana], isFetching: false };
    const { input, type, onSent } = await setup();
    await type('so good @an');
    expect(mockSuggestionQuery).toHaveBeenLastCalledWith('an');
    await fireEvent.press(screen.getByTestId('mention-option-ana'));
    expect(input().props.value).toBe('so good @ana ');

    mockMutateAsync.mockResolvedValue({});
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'so good @ana ', mentionIds: ['id-ana'], media: null }),
    );
    expect(onSent).toHaveBeenCalled();
    expect(input().props.value).toBe('');
  });

  it('drops a mention removed before sending', async () => {
    mockSuggestions = { data: [ana], isFetching: false };
    const { type } = await setup();
    await type('@an');
    await fireEvent.press(screen.getByTestId('mention-option-ana'));
    await type('never mind');
    mockMutateAsync.mockResolvedValue({});
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ mentionIds: [] }));
  });

  it('hides suggestions when not typing a mention', async () => {
    mockSuggestions = { data: [ana], isFetching: false };
    const { type } = await setup();
    await type('hello there');
    expect(screen.queryByTestId('mention-suggestions')).toBeNull();
    expect(mockSuggestionQuery).toHaveBeenLastCalledWith(null);
  });
});

describe('CommentComposer sending', () => {
  it('keeps the draft when posting fails', async () => {
    const { input, type, onSent } = await setup();
    await type('first try');
    mockMutateAsync.mockRejectedValue(new Error('offline'));
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(input().props.value).toBe('first try');
    expect(onSent).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first is sending', async () => {
    const { type } = await setup();
    await type('once');
    let resolve: (v: unknown) => void = () => undefined;
    mockMutateAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    await fireEvent.press(screen.getByTestId('comment-send'));
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolve({}));
  });

  it('can’t send an empty comment, and offers Choose Photo / Paste', async () => {
    await setup();
    expect(screen.getByTestId('comment-send').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('comment-attach'));
    expect(screen.getByText('Choose Photo')).toBeTruthy();
    expect(screen.getByText('Paste Sticker or Image')).toBeTruthy();
  });
});

describe('CommentComposer anonymous takes', () => {
  it('offers no identity choice where Anonymous Takes aren’t open', async () => {
    const { type } = await setup();
    await type('hi');
    expect(screen.queryByTestId('comment-as-anonymous')).toBeNull();
  });

  it('starts as you, and sends text only as this post’s chef once picked', async () => {
    mockAnonStatus = { available: true, open: true, name: 'Chef #03' };
    mockSuggestions = { data: [ana], isFetching: false };
    const { input, type } = await setup();
    await type('needs salt @an');
    // Named by default on every post.
    expect(screen.getByTestId('comment-attach')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('comment-as-anonymous'));
    expect(screen.getByText('You’ll appear as Chef #03 on this post. Text only.')).toBeTruthy();
    // No pictures and no @mention suggestions when anonymous.
    expect(screen.queryByTestId('comment-attach')).toBeNull();
    expect(screen.queryByTestId('mention-suggestions')).toBeNull();
    expect(input().props.placeholder).toBe('Add an anonymous take…');

    mockMutateAsync.mockResolvedValue({});
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: 'needs salt @an',
      reply: null,
      anonymous: true,
      anonNumber: 3,
    });
    // Stays anonymous for the next take in this thread.
    expect(screen.getByText('You’ll appear as Chef #03 on this post. Text only.')).toBeTruthy();
  });

  it('never switches to your name on its own if the creator turns it off', async () => {
    mockAnonStatus = { available: true, open: true, name: null };
    const { type } = await setup();
    await type('hot take');
    await fireEvent.press(screen.getByTestId('comment-as-anonymous'));
    expect(screen.getByText('You’ll get a Chef number for this post. Text only.')).toBeTruthy();
    mockAnonStatus = { available: true, open: false, name: null };
    await type('hot take!');
    expect(screen.getByText('Anonymous takes are off for this post now.')).toBeTruthy();
    expect(screen.getByTestId('comment-send').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync).not.toHaveBeenCalled();

    // Only once they choose it.
    await fireEvent.press(screen.getByTestId('comment-as-me-instead'));
    mockMutateAsync.mockResolvedValue({});
    await fireEvent.press(screen.getByTestId('comment-send'));
    expect(mockMutateAsync.mock.calls[0][0]).not.toHaveProperty('anonymous');
  });
});
