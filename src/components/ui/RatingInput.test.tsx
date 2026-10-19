import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RatingInput } from './RatingInput';

function Harness({ initial, onChange }: { initial: number | null; onChange?: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <GestureHandlerRootView>
      <RatingInput
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </GestureHandlerRootView>
  );
}

describe('RatingInput', () => {
  it('shows an empty state before rating', async () => {
    await render(<Harness initial={null} />);
    expect(screen.getByText('0.0')).toBeOnTheScreen();
    expect(screen.getByText('Slide to rate')).toBeOnTheScreen();
  });

  it('steps by 0.1 without float drift and clamps at 10', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={9.8} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('rating-increment'));
    expect(screen.getByText('9.9')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('rating-increment'));
    await fireEvent.press(screen.getByTestId('rating-increment'));
    expect(screen.getByText('10.0')).toBeOnTheScreen();
    expect(onChange).toHaveBeenLastCalledWith(10);
    await fireEvent.press(screen.getByTestId('rating-decrement'));
    expect(screen.getByText('9.9')).toBeOnTheScreen();
  });

  it('accepts an exact typed rating', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={7} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('rating-number'));
    const input = screen.getByTestId('rating-exact-input');
    await fireEvent.changeText(input, '9.2');
    await fireEvent(input, 'submitEditing');
    expect(onChange).toHaveBeenLastCalledWith(9.2);
    expect(screen.getByText('9.2')).toBeOnTheScreen();
    expect(screen.getByText('Exceptional')).toBeOnTheScreen();
  });

  it('ignores invalid typed ratings', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={7} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('rating-number'));
    const input = screen.getByTestId('rating-exact-input');
    await fireEvent.changeText(input, '11.5');
    await fireEvent(input, 'submitEditing');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('7.0')).toBeOnTheScreen();
  });

  it('is exposed to assistive tech as an adjustable control', async () => {
    await render(<Harness initial={8.4} />);
    const slider = screen.getByRole('adjustable');
    expect(slider.props.accessibilityValue).toMatchObject({ min: 0, max: 10, now: 8.4, text: '8.4' });
  });
});
