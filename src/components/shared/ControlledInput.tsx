import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { AppInput, type AppInputProps } from '@/components/ui';

export interface ControlledInputProps<T extends FieldValues> extends Omit<AppInputProps, 'value' | 'onChangeText'> {
  control: Control<T>;
  name: FieldPath<T>;
}

/** AppInput bound to a react-hook-form field, showing its validation error. */
export function ControlledInput<T extends FieldValues>({ control, name, onBlur, ...rest }: ControlledInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppInput
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
