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

  it('reflects the liked state for accessibility and hides a zero count', async () => {
    await render(<LikeButton liked count={0} onToggle={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByTestId('like-count')).toBeNull();
  });
});
