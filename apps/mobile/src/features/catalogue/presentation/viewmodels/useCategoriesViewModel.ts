import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  type ArchiveCategory,
  CatalogueInputError,
  type LoadCatalogueReference,
  type SaveCategory,
} from '../../domain/usecases/catalogueUseCases';
import { catalogueKeys } from '../catalogueKeys';

export interface CategoriesViewModelDeps {
  loadReference: LoadCatalogueReference;
  saveCategory: SaveCategory;
  archiveCategory: ArchiveCategory;
}

export function useCategoriesViewModel(deps: CategoriesViewModelDeps, shopId: string) {
  const queryClient = useQueryClient();
  const reference = useQuery({
    queryKey: catalogueKeys.reference(shopId),
    queryFn: () => deps.loadReference.execute(shopId),
  });
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onError = (error: unknown) =>
    setErrorKey(
      error instanceof CatalogueInputError
        ? 'catalogue.errors.CATEGORY_NAME'
        : translateError(error).messageKey,
    );
  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogueKeys.all(shopId) });

  const save = useMutation({
    mutationFn: (c: { id: string | null; name: string }) => deps.saveCategory.execute(shopId, c.id, c.name),
    onSuccess: (_id, c) => {
      if (c.id === null) setNewName('');
      setEditing(null);
      void refresh();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: (id: string) => deps.archiveCategory.execute(shopId, id),
    onSuccess: () => void refresh(),
    onError,
  });

  return {
    state: {
      status: reference.isPending ? 'loading' : reference.isError ? 'error' : 'loaded',
      loadErrorKey: reference.isError ? translateError(reference.error).messageKey : null,
      categories: reference.data?.categories ?? [],
      newName,
      editing,
      confirmArchiveId,
      busy: save.isPending || archive.isPending,
      errorKey,
    } as const,
    actions: {
      setNewName: (v: string) => {
        setNewName(v);
        setErrorKey(null);
      },
      add: () => {
        if (!save.isPending && newName.trim()) save.mutate({ id: null, name: newName });
      },
      startEdit: (id: string, name: string) => setEditing({ id, name }),
      setEditName: (name: string) => setEditing((e) => (e ? { ...e, name } : e)),
      cancelEdit: () => setEditing(null),
      saveEdit: () => {
        if (editing && !save.isPending) save.mutate({ id: editing.id, name: editing.name });
      },
      askArchive: (id: string) => setConfirmArchiveId(id),
      cancelArchive: () => setConfirmArchiveId(null),
      confirmArchive: () => {
        const id = confirmArchiveId;
        setConfirmArchiveId(null);
        if (id) archive.mutate(id);
      },
      retry: () => void reference.refetch(),
    },
  };
}
