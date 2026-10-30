import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

/** Password field with a show / hide eye. Autofill hints let the phone's password manager help. */
export function PasswordInput({
  label,
  isNew = false,
  ...rest
}: Omit<TextInputProps, 'secureTextEntry' | 'right'> & { label: string; isNew?: boolean }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <TextInput
      mode="outlined"
      label={label}
      accessibilityLabel={label}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      textContentType={isNew ? 'newPassword' : 'password'}
      right={
        <TextInput.Icon
          icon={visible ? 'eye-off-outline' : 'eye-outline'}
          onPress={() => setVisible((v) => !v)}
          accessibilityLabel={visible ? t('auth.password.hide') : t('auth.password.show')}
          forceTextInputFocus={false}
        />
      }
      {...rest}
    />
  );
}
