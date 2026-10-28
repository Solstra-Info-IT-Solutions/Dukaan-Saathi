import { useLocalSearchParams } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { TicketScreen } from '@/features/support';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function TicketRoute() {
  const { features } = useDependencies();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId || !id) return null;
  return (
    <RequirePermission permission="support.create">
      <TicketScreen key={id} deps={features.support} shopId={shopId} ticketId={id} />
    </RequirePermission>
  );
}
