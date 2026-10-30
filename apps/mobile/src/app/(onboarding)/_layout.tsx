import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from 'react-native-paper';

/** Choosing or creating a shop. On tablets the content keeps a readable width, centred. */
export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.colors.background,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          },
        }}
      />
    </View>
  );
}
