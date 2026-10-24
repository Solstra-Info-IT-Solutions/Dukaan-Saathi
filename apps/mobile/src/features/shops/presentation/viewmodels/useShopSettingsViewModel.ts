import { PAYMENT_METHODS } from '@ds/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { ShopSettings, ShopSettingsPatch } from '../../domain/entities/Shop';
import { ShopInputError } from '../../domain/errors';
import type { GetShopSettings, UpdateShopSettings } from '../../domain/usecases/shopUseCases';
import { shopKeys } from '../shopKeys';

export interface ShopSettingsViewModelDeps {
  getSettings: GetShopSettings;
  updateSettings: UpdateShopSettings;
}

type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Editable fields, in the units the form shows (percent, not basis points). */
export interface SettingsDraft {
  invoicePrefix: string;
  upiVpa: string;
  roundOffEnabled: boolean;
  enabledPaymentMethods: PaymentMethod[];
  cashierDiscountPercent: string;
  managerDiscountPercent: string;
}

export function toDraft(s: ShopSettings): SettingsDraft {
  return {
    invoicePrefix: s.invoicePrefix,
    upiVpa: s.upiVpa ?? '',
    roundOffEnabled: s.roundOffEnabled,
    enabledPaymentMethods: [...s.enabledPaymentMethods],
    cashierDiscountPercent: String(s.cashierDiscountLimitBp / 100),
    managerDiscountPercent: String(s.managerDiscountLimitBp / 100),
  };
}

function percentToBp(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : -1;
}

/** Only the fields that changed, converted to the RPC's units. */
export function diffPatch(original: ShopSettings, draft: SettingsDraft): ShopSettingsPatch {
  const patch: ShopSettingsPatch = {};
  const prefix = draft.invoicePrefix.trim().toUpperCase();
  if (prefix !== original.invoicePrefix) patch.invoicePrefix = prefix;
  const vpa = draft.upiVpa.trim() || null;
  if (vpa !== original.upiVpa) patch.upiVpa = vpa;
  if (draft.roundOffEnabled !== original.roundOffEnabled) patch.roundOffEnabled = draft.roundOffEnabled;
  const methods = PAYMENT_METHODS.filter((m) => draft.enabledPaymentMethods.includes(m));
  if (methods.join() !== PAYMENT_METHODS.filter((m) => original.enabledPaymentMethods.includes(m)).join()) {
    patch.enabledPaymentMethods = methods;
  }
  const cashierBp = percentToBp(draft.cashierDiscountPercent);
  if (cashierBp !== original.cashierDiscountLimitBp) patch.cashierDiscountLimitBp = cashierBp;
  const managerBp = percentToBp(draft.managerDiscountPercent);
  if (managerBp !== original.managerDiscountLimitBp) patch.managerDiscountLimitBp = managerBp;
  return patch;
}

export function useShopSettingsViewModel(
  { getSettings, updateSettings }: ShopSettingsViewModelDeps,
  shopId: string,
) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: shopKeys.settings(shopId),
    queryFn: () => getSettings.execute(shopId),
  });
  // Draft = server values + local edits. Derived, so a refetch never needs an effect to resync.
  const [edits, setEdits] = useState<Partial<SettingsDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const draft = useMemo(
    () => (settings.data ? { ...toDraft(settings.data), ...edits } : null),
    [settings.data, edits],
  );

  const save = useMutation({
    mutationFn: (patch: ShopSettingsPatch) => updateSettings.execute(shopId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(shopKeys.settings(shopId), updated);
      setEdits({});
      setSaved(true);
    },
    onError: (error) => {
      if (error instanceof ShopInputError) setFieldErrors(error.fields);
    },
  });

  const change = useCallback(<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setEdits((e) => ({ ...e, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: '' }));
    setSaved(false);
  }, []);

  const togglePaymentMethod = useCallback(
    (method: PaymentMethod) => {
      const current = draft?.enabledPaymentMethods ?? [];
      setEdits((e) => ({
        ...e,
        enabledPaymentMethods: current.includes(method)
          ? current.filter((m) => m !== method)
          : [...current, method],
      }));
      setSaved(false);
    },
    [draft],
  );

  const patch = useMemo(
    () => (settings.data && draft ? diffPatch(settings.data, draft) : {}),
    [settings.data, draft],
  );
  const dirty = Object.keys(patch).length > 0;

  const submit = useCallback(() => {
    if (!dirty || save.isPending) return;
    setFieldErrors({});
    save.mutate(patch);
  }, [dirty, save, patch]);

  const saveError =
    save.error && !(save.error instanceof ShopInputError) ? translateError(save.error).messageKey : null;

  return {
    state: {
      status: settings.isPending ? 'loading' : settings.isError ? 'error' : 'loaded',
      loadErrorKey: settings.isError ? translateError(settings.error).messageKey : null,
      draft,
      dirty,
      saving: save.isPending,
      saved,
      saveErrorKey: saveError,
      fieldErrors,
      paymentMethods: PAYMENT_METHODS,
    } as const,
    actions: { change, togglePaymentMethod, submit, retry: () => void settings.refetch() },
  };
}
