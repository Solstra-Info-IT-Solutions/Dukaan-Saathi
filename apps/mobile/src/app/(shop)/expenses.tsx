import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { ExpensesScreen } from '@/features/expenses';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function ExpensesRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shop = useSessionStore((s) => s.activeShop);
  const canCreate = useHasPermission('expense.create');
  if (!features || !shop) return null;
  return (
    <RequirePermission permission="expense.view">
      <ExpensesScreen
        deps={features.expenses}
        shopId={shop.shopId}
        canCreate={canCreate}
        canVoid={shop.role === 'owner'}
        onAdd={() => router.push('/expense-new')}
      />
    </RequirePermission>
  );
}
