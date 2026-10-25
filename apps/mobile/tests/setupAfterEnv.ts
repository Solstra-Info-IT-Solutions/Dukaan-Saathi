import '@testing-library/react-native/matchers';
import { configure } from '@testing-library/react-native';

// findBy*/waitFor default to 1 s, which a busy CI runner or this dev PC can exceed.
configure({ asyncUtilTimeout: 5000 });
