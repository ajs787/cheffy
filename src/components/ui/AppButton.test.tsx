import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppButton } from './AppButton';

describe('AppButton', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<AppButton label="Post" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading or disabled', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<AppButton label="Post" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button'));
    await rerender(<AppButton label="Post" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
