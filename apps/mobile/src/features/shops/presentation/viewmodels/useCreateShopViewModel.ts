import { BUSINESS_CATEGORIES } from '@ds/contracts';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { translateError } from '@/core/errors/translateError';
import { zodResolver } from '@/shared/validation/zodResolver';
import type { NewShop, ShopActivation } from '../../domain/entities/Shop';
import { ShopInputError } from '../../domain/errors';
import type { ActivateShop, CreateShop, LoadMyContext } from '../../domain/usecases/shopUseCases';

export interface CreateShopViewModelDeps {
  createShop: CreateShop;
  loadContext: LoadMyContext;
  activateShop: ActivateShop;
  newOperationId: () => string;
}

const FormSchema = z.object({
  name: z.string().trim().min(2, 'NAME_LENGTH').max(80, 'NAME_LENGTH'),
  businessCategory: z.enum(BUSINESS_CATEGORIES),
  city: z.string().trim().max(80, 'CITY_LENGTH').optional(),
});
export type CreateShopForm = z.infer<typeof FormSchema>;

/**
 * Create-shop form. The idempotency key is kept while the form values are unchanged, so a retry after a
 * network error cannot create a second shop; editing the form after a failure starts a new operation.
 */
export function useCreateShopViewModel(
  deps: CreateShopViewModelDeps,
  onActivated: (a: ShopActivation) => void,
) {
  const form = useForm<CreateShopForm>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: '', businessCategory: 'kirana', city: '' },
  });
  const [status, setStatus] = useState<'editing' | 'submitting' | 'error'>('editing');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; opId: string } | null>(null);
  const submitting = useRef(false);

  const submitValues = useCallback(
    async (values: CreateShopForm) => {
      if (submitting.current) return;
      submitting.current = true;
      setStatus('submitting');
      setErrorKey(null);
      const input: NewShop = {
        name: values.name,
        businessCategory: values.businessCategory,
        ...(values.city ? { city: values.city } : {}),
      };
      const payload = JSON.stringify(input);
      if (attempt.current?.payload !== payload) attempt.current = { payload, opId: deps.newOperationId() };
      try {
        const shopId = await deps.createShop.execute(input, attempt.current.opId);
        const context = await deps.loadContext.execute();
        const membership = context.memberships.find((m) => m.shopId === shopId);
        if (!membership) throw new Error('created shop is missing from context');
        onActivated(await deps.activateShop.execute(membership));
        setStatus('editing');
      } catch (error) {
        if (error instanceof ShopInputError) {
          for (const [field, code] of Object.entries(error.fields)) {
            form.setError(field as keyof CreateShopForm, { type: 'server', message: code });
          }
          setStatus('editing');
        } else {
          setErrorKey(translateError(error).messageKey);
          setStatus('error');
        }
      } finally {
        submitting.current = false;
      }
    },
    [deps, form, onActivated],
  );

  const submit = useCallback(() => {
    void form.handleSubmit(submitValues)();
  }, [form, submitValues]);

  return {
    form,
    state: { status, errorKey, categories: BUSINESS_CATEGORIES },
    actions: { submit },
  };
}
