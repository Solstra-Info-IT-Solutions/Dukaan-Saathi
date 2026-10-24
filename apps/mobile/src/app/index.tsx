import { Redirect } from 'expo-router';
import { useSessionStore } from '@/core/session/sessionStore';

// Anchor route: sends the user to the group their session allows.
export default function IndexRoute() {
  const authStatus = useSessionStore((s) => s.authStatus);
  const hasShop = useSessionStore((s) => s.activeShop !== null);
  if (authStatus !== 'signedIn') return <Redirect href="/login" />;
  return <Redirect href={hasShop ? '/home' : '/select-shop'} />;
}
