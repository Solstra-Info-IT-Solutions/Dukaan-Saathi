import { createContext, type ReactNode, useContext } from 'react';
import type { Container } from './container';

const DependenciesContext = createContext<Container | null>(null);

export function DependenciesProvider({ value, children }: { value: Container; children: ReactNode }) {
  return <DependenciesContext.Provider value={value}>{children}</DependenciesContext.Provider>;
}

/** Used by route files only; screens receive their dependencies as props. */
export function useDependencies(): Container {
  const container = useContext(DependenciesContext);
  if (!container) throw new Error('useDependencies must be used inside <DependenciesProvider>');
  return container;
}
