import { fireEvent, render, screen } from '@testing-library/react-native';

import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('shows the count and toggles', async () => {
    const onToggle = jest.fn();
    await render(<LikeButton liked={false} count={12} onToggle={onToggle} />);
    expect(screen.getByTestId('like-count')).toHaveTextContent('12');
    await fireEvent.press(screen.getByRole('button', { name: 'Like. 12 likes' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('opens the likes list from the count without toggling the like', async () => {
    const onToggle = jest.fn();
    const onPressCount = jest.fn();
    await render(<LikeButton liked={false} count={3} onToggle={onToggle} onPressCount={onPressCount} />);
    await fireEvent.press(screen.getByRole('button', { name: '3 likes' }));
    expect(onPressCount).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Like' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPressCount).toHaveBeenCalledTimes(1);
  });

  it('with countWidth, keeps the same-width count slot at any count (feed row never shifts)', async () => {
    const onToggle = jest.fn();
    const onPressCount = jest.fn();
    const heart = (count: number) => (
      <LikeButton
        liked={false}
        count={count}
        countWidth={20}
        onToggle={onToggle}
        onPressCount={onPressCount}
      />
    );
    const slotWidth = (testID: string) =>
      [screen.getByTestId(testID).props.style].flat(Infinity).reduce((w, s) => s?.width ?? w, undefined);
    const view = await render(heart(0));
    // No likes: an empty slot of the same width, nothing to open.
    expect(screen.queryByTestId('like-count')).toBeNull();
    expect(slotWidth('like-count-slot')).toBe(20);
    for (const [count, shown] of [
      [1, '1'],
      [10, '10'],
      [100, '100'],
      [1250, '1.3k'],
    ] as const) {
      await view.rerender(heart(count));
      expect(screen.getByTestId('like-count')).toHaveTextContent(shown);
      expect(slotWidth('like-count-button')).toBe(20);
    }
    // The count opens the likers; the heart still toggles.
    await fireEvent.press(screen.getByRole('button', { name: '1250 likes' }));
    expect(onPressCount).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Like' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects the liked state for accessibility and hides a zero count', async () => {
    await render(<LikeButton liked count={0} onToggle={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByTestId('like-count')).toBeNull();
  });

  it('long-press on an unliked heart offers an anonymous like', async () => {
    const onToggle = jest.fn();
    const onLongPress = jest.fn();
    await render(<LikeButton liked={false} count={2} onToggle={onToggle} onLongPress={onLongPress} />);
    await fireEvent(screen.getByTestId('like-button'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('a liked heart ignores long-press, and marks an anonymous like', async () => {
    const onLongPress = jest.fn();
    await render(<LikeButton liked anonymous count={2} onToggle={jest.fn()} onLongPress={onLongPress} />);
    expect(screen.getByTestId('like-button').props.onLongPress).toBeUndefined();
    expect(screen.getByTestId('like-anonymous-badge')).toBeTruthy();
    expect(screen.getByRole('button', { name: /You liked this anonymously/ })).toBeTruthy();
  });

  it('shows no badge for a named like', async () => {
    await render(<LikeButton liked count={2} onToggle={jest.fn()} />);
    expect(screen.queryByTestId('like-anonymous-badge')).toBeNull();
  });
});
