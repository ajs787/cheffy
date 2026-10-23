import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { AppInput, PasswordInput, type AppInputProps } from '@/components/ui';

export interface ControlledInputProps<T extends FieldValues> extends Omit<
  AppInputProps,
  'value' | 'onChangeText'
> {
  control: Control<T>;
  name: FieldPath<T>;
  /** Renders a PasswordInput (hidden text with a show/hide button). */
  password?: boolean;
}

/** AppInput bound to a react-hook-form field, showing its validation error. */
export function ControlledInput<T extends FieldValues>({
  control,
  name,
  onBlur,
  password = false,
  ...rest
}: ControlledInputProps<T>) {
  const Input = password ? PasswordInput : AppInput;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          {...rest}
          ref={field.ref}
          value={(field.value as string | undefined) ?? ''}
          onChangeText={field.onChange}
          onBlur={(e) => {
            field.onBlur();
            onBlur?.(e);
          }}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
