import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { SupportScreen } from '@/features/support';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function HelpRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="support.create">
      <SupportScreen
        deps={features.support}
        shopId={shopId}
        onNew={() => router.push('/help-new')}
        onOpen={(id) => router.push({ pathname: '/help-ticket', params: { id } })}
      />
    </RequirePermission>
  );
}
