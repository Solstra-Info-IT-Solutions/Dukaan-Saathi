import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { StaffScreen } from '@/features/staff';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function StaffRoute() {
  const { features } = useDependencies();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="staff.manage">
      <StaffScreen deps={features.staff} shopId={shopId} />
    </RequirePermission>
  );
}
