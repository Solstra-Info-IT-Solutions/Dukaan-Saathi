import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { ExpenseFormScreen } from '@/features/expenses';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function NewExpenseRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null;
  return (
    <RequirePermission permission="expense.create">
      <ExpenseFormScreen
        deps={features.expenses}
        shopId={shop.shopId}
        deviceId={shop.deviceId}
        onSaved={() => router.back()}
      />
    </RequirePermission>
  );
}
