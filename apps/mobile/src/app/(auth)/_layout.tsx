import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from 'react-native-paper';

/** Sign-in screens. On tablets the content keeps a phone-like width, centred on the page colour. */
export default function AuthLayout() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.colors.background,
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
          },
        }}
      />
    </View>
  );
}
