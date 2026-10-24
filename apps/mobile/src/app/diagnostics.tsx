import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { DiagnosticsScreen } from '@/features/diagnostics';

export default function DiagnosticsRoute() {
  const { diagnostics } = useDependencies();
  return <DiagnosticsScreen deps={diagnostics} />;
}
