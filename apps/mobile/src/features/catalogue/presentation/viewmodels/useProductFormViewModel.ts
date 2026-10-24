import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { translateError } from '@/core/errors/translateError';
import { emptyProductDraft, type ProductDraft } from '../../domain/entities/Catalogue';
import {
  type ArchiveProduct,
  CatalogueInputError,
  type GetProduct,
  type LoadCatalogueReference,
  productToDraft,
  type SaveProduct,
} from '../../domain/usecases/catalogueUseCases';
import { catalogueKeys } from '../catalogueKeys';

export interface ProductFormViewModelDeps {
  getProduct: GetProduct;
  saveProduct: SaveProduct;
  archiveProduct: ArchiveProduct;
  loadReference: LoadCatalogueReference;
  newId: () => string;
}

/**
 * Create / edit a product. A new product gets its id when the form opens, so a retried save after a
 * network error updates the same product instead of creating a second one.
 */
export function useProductFormViewModel(
  deps: ProductFormViewModelDeps,
  shopId: string,
  productId: string | null,
  onDone: () => void,
) {
  const queryClient = useQueryClient();
  const [newId] = useState(() => deps.newId());
  const existing = useQuery({
    queryKey: catalogueKeys.product(shopId, productId ?? 'new'),
    queryFn: () => deps.getProduct.execute(shopId, productId as string),
    enabled: productId !== null,
  });
  const reference = useQuery({
    queryKey: catalogueKeys.reference(shopId),
    queryFn: () => deps.loadReference.execute(shopId),
  });

  const values = useMemo<ProductDraft | undefined>(
    () =>
      existing.data
        ? productToDraft(existing.data)
        : productId === null
          ? { ...emptyProductDraft, id: newId }
          : undefined,
    [existing.data, productId, newId],
  );
  const form = useForm<ProductDraft>({ values, defaultValues: { ...emptyProductDraft, id: newId } });
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const afterWrite = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: catalogueKeys.all(shopId) });
    onDone();
  }, [queryClient, shopId, onDone]);

  const save = useMutation({
    mutationFn: (draft: ProductDraft) => deps.saveProduct.execute(shopId, draft),
    onSuccess: afterWrite,
    onError: (error) => {
      if (error instanceof CatalogueInputError) {
        for (const [field, code] of Object.entries(error.fields)) {
          form.setError(field as keyof ProductDraft, { type: 'validate', message: code });
        }
      } else {
        setErrorKey(translateError(error).messageKey);
      }
    },
  });

  const archive = useMutation({
    mutationFn: () => deps.archiveProduct.execute(shopId, productId as string),
    onSuccess: afterWrite,
    onError: (error) => setErrorKey(translateError(error).messageKey),
  });

  const submit = useCallback(() => {
    if (save.isPending) return;
    setErrorKey(null);
    void form.handleSubmit((draft) => save.mutate(draft))();
  }, [form, save]);

  return {
    form,
    state: {
      isNew: productId === null,
      status: productId !== null && existing.isPending ? 'loading' : existing.isError ? 'error' : 'ready',
      loadErrorKey: existing.isError ? translateError(existing.error).messageKey : null,
      units: reference.data?.units ?? [],
      categories: reference.data?.categories ?? [],
      taxRates: reference.data?.taxRates ?? [],
      saving: save.isPending,
      archiving: archive.isPending,
      errorKey,
      confirmArchive,
    } as const,
    actions: {
      submit,
      askArchive: () => setConfirmArchive(true),
      cancelArchive: () => setConfirmArchive(false),
      confirmArchive: () => {
        setConfirmArchive(false);
        if (productId && !archive.isPending) archive.mutate();
      },
      retry: () => void existing.refetch(),
    },
  };
}
