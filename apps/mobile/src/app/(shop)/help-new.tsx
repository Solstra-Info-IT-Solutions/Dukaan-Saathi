import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { NewTicketScreen } from '@/features/support';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function NewTicketRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="support.create">
      <NewTicketScreen
        deps={features.support}
        shopId={shopId}
        onSent={(id) => router.replace({ pathname: '/help-ticket', params: { id } })}
      />
    </RequirePermission>
  );
}
