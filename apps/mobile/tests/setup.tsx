// Global Jest setup for the mobile app.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

// Icon fonts are assets Jest cannot load; render the icon name as text instead.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { __esModule: true, default: Icon };
});

// The UPI QR draws with native SVG; render its value as text so tests can assert the payment link.
jest.mock('react-native-qrcode-svg', () => {
  const { Text } = require('react-native');
  const QRCode = ({ value }: { value: string }) => <Text>{`qr:${value}`}</Text>;
  return { __esModule: true, default: QRCode };
});

// The camera is native; tests drive scanning through the ViewModel, so a granted, empty camera is enough.
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  const permission = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
  return {
    CameraView: (props: object) => <View testID="camera" {...props} />,
    useCameraPermissions: () => [
      permission,
      jest.fn(async () => permission),
      jest.fn(async () => permission),
    ],
  };
});
