import { Button as PaperButton, type ButtonProps } from 'react-native-paper';
import { brand } from '@/shared/theme/brand';

/**
 * Paper's Button with the brand's call-to-action style: contained (primary) buttons are action green with a forest
 * label — 5.3:1 contrast, where white on action green would be 2.3:1. Other modes follow the theme (forest).
 * Disabled buttons keep Paper's disabled colours.
 */
export function Button({ mode, buttonColor, textColor, labelStyle, ...rest }: ButtonProps) {
  if (mode === 'contained' && !buttonColor) {
    return (
      <PaperButton
        mode={mode}
        buttonColor={brand.green}
        textColor={rest.disabled ? undefined : (textColor ?? brand.primary)}
        labelStyle={[{ fontWeight: '700' }, labelStyle]}
        {...rest}
      />
    );
  }
  return (
    <PaperButton
      mode={mode}
      buttonColor={buttonColor}
      textColor={textColor}
      labelStyle={labelStyle}
      {...rest}
    />
  );
}
