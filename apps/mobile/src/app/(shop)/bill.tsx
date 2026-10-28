import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { hasPermission, useSessionStore } from '@/core/session/sessionStore';
import { type BillingContext, BillingScreen } from '@/features/billing';
import { VoiceBillingSheet } from '@/features/voice';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function BillRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shop = useSessionStore((s) => s.activeShop);
  const context = useMemo<BillingContext | null>(
    () =>
      shop && {
        shopId: shop.shopId,
        shopName: shop.shopName,
        role: shop.role,
        canDiscount: hasPermission(shop, 'sale.discount'),
        canOverridePrice: hasPermission(shop, 'sale.price_override'),
        canManageProducts: hasPermission(shop, 'product.manage'),
        canGiveUdhaar: hasPermission(shop, 'udhaar.grant'),
        canAddCustomer: hasPermission(shop, 'customer.quick_create'),
        deviceId: shop.deviceId,
        fy: shop.fy,
        lastSeq: shop.lastSeq,
      },
    [shop],
  );
  // Voice billing: entitlement voice.billing and a speech service on the phone (features/voice-billing.md).
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => {
    if (!features || !shop) return;
    let live = true;
    features.voice
      .isEnabled(shop.shopId)
      .then((on) => live && setVoiceOn(on && features.voice.recognizer.isAvailable()))
      .catch(() => live && setVoiceOn(false));
    return () => {
      live = false;
    };
  }, [features, shop]);
  if (!features || !context || !shop) return null;
  return (
    <RequirePermission permission="sale.create">
      <BillingScreen
        deps={features.billing}
        context={context}
        onCompleted={(saleId) => router.push({ pathname: '/receipt', params: { saleId } })}
        onCreateProduct={(barcode) => router.push({ pathname: '/product', params: { barcode } })}
        voice={
          voiceOn
            ? (addLines) => (
                <VoiceBillingSheet
                  deps={features.voice}
                  shopId={shop.shopId}
                  canLearn={hasPermission(shop, 'product.manage')}
                  onConfirm={addLines}
                />
              )
            : undefined
        }
      />
    </RequirePermission>
  );
}
