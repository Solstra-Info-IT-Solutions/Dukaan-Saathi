import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { DiagnosticsScreen } from '@/features/diagnostics';

// Phase 01 entry: the diagnostics screen. Phase 02 replaces this with the session redirect.
export default function IndexRoute() {
  const { diagnostics } = useDependencies();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <DiagnosticsScreen deps={diagnostics} />
    </SafeAreaView>
  );
}
