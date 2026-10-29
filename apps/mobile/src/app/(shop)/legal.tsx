import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { LegalScreen } from '@/features/config';

export default function LegalRoute() {
  const { features } = useDependencies();
  if (!features) return null;
  return <LegalScreen deps={features.config} />;
}
