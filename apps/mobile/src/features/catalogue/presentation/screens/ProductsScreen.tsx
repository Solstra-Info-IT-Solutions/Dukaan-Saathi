import { formatPaise, paise } from '@ds/domain-core';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Chip, FAB, List, Searchbar, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type ProductsViewModelDeps, useProductsViewModel } from '../viewmodels/useProductsViewModel';

export function ProductsScreen({
  deps,
  shopId,
  canManage,
  onOpenProduct,
  onAddProduct,
  onOpenCategories,
  onOpenImport,
}: {
  deps: ProductsViewModelDeps;
  shopId: string;
  canManage: boolean;
  onOpenProduct: (productId: string) => void;
  onAddProduct: () => void;
  onOpenCategories: () => void;
  onOpenImport: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useProductsViewModel(deps, shopId);
  const lang = i18n.language === 'hi' ? 'hi' : 'en';

  const header = (
    <View style={styles.header}>
      <Searchbar
        placeholder={t('catalogue.search')}
        accessibilityLabel={t('catalogue.search')}
        value={state.query}
        onChangeText={actions.setQuery}
        loading={state.searching}
      />
      {state.categories.length > 0 ? (
        <View style={styles.chips}>
          {state.categories.map((c) => (
            <Chip key={c.id} selected={state.categoryId === c.id} onPress={() => actions.setCategoryId(c.id)}>
              {lang === 'hi' && c.nameHi ? c.nameHi : c.name}
            </Chip>
          ))}
        </View>
      ) : null}
      {canManage ? (
        <View style={styles.row}>
          <Button mode="text" icon="shape-outline" onPress={onOpenCategories}>
            {t('catalogue.categories')}
          </Button>
          <Button mode="text" icon="file-upload-outline" onPress={onOpenImport}>
            {t('catalogue.import')}
          </Button>
        </View>
      ) : null}
    </View>
  );

  let body;
  if (state.status === 'loading') body = <LoadingState />;
  else if (state.status === 'error')
    body = <ErrorState messageKey={state.errorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;
  else if (state.items.length === 0)
    body = (
      <EmptyState
        title={state.query ? t('catalogue.noResults') : t('catalogue.empty')}
        action={canManage && !state.query ? { label: t('catalogue.add'), onPress: onAddProduct } : undefined}
      />
    );
  else
    body = (
      <FlatList
        data={state.items}
        keyExtractor={(p) => p.id}
        onEndReached={actions.loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => {
          const unit = state.unitLabels[item.unitCode];
          return (
            <List.Item
              title={item.name}
              description={[item.nameHi, unit ? (unit[lang] ?? unit.en) : item.unitCode]
                .filter(Boolean)
                .join(' · ')}
              right={() => <Text variant="titleMedium">{formatPaise(paise(item.pricePaise))}</Text>}
              onPress={canManage ? () => onOpenProduct(item.id) : undefined}
              accessibilityLabel={`${item.name} ${formatPaise(paise(item.pricePaise))}`}
            />
          );
        }}
        ListFooterComponent={
          state.loadingMore ? <Text style={styles.footer}>{t('common.loading')}</Text> : undefined
        }
      />
    );

  return (
    <View style={styles.container}>
      {header}
      <View style={styles.body}>{body}</View>
      {canManage ? (
        <FAB
          icon="plus"
          label={t('catalogue.add')}
          style={styles.fab}
          onPress={onAddProduct}
          accessibilityLabel={t('catalogue.add')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  body: { flex: 1 },
  footer: { textAlign: 'center', padding: spacing.md },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
