import { IMPORT_FIELDS } from '@ds/domain-core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, List, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { ImportRow } from '../../domain/entities/Import';
import { type ImportViewModelDeps, useImportViewModel } from '../viewmodels/useImportViewModel';

const EDITABLE = ['name', 'price', 'unit'] as const;

export function ImportScreen({
  deps,
  shopId,
  onDone,
}: {
  deps: ImportViewModelDeps;
  shopId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useImportViewModel(deps, shopId);
  const error = (
    <HelperText type="error" visible={state.errorKey !== null}>
      {state.errorKey ? t(state.errorKey, state.errorParams) : ''}
    </HelperText>
  );

  if (state.phase === 'reading') return <LoadingState label={t('imports.reading')} />;
  if (state.phase === 'committing') return <LoadingState label={t('imports.committing')} />;

  if (state.phase === 'committed' && state.result) {
    return (
      <View style={styles.center}>
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('imports.done.title')}
        </Text>
        <Text variant="bodyLarge">
          {t('imports.done.body', { created: state.result.created, updated: state.result.updated })}
        </Text>
        <Button mode="contained" onPress={onDone} contentStyle={styles.button} style={styles.gap}>
          {t('imports.done.back')}
        </Button>
      </View>
    );
  }

  if (state.phase === 'idle' || !state.summary) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('imports.title')}
        </Text>
        <Text variant="bodyMedium">{t('imports.intro')}</Text>
        <Card>
          <Card.Content>
            <Text variant="titleSmall">{t('imports.columnsTitle')}</Text>
            <Text variant="bodyMedium">{IMPORT_FIELDS.map((f) => t(`imports.fields.${f}`)).join(', ')}</Text>
            <Text variant="bodySmall" style={styles.gap}>
              {t('imports.columnsHelp')}
            </Text>
          </Card.Content>
        </Card>
        {error}
        <Button
          mode="contained"
          icon="file-upload-outline"
          onPress={actions.pickFile}
          contentStyle={styles.button}
        >
          {t('imports.pick')}
        </Button>
      </ScrollView>
    );
  }

  const s = state.summary;
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {s.fileName}
      </Text>
      <Card>
        <List.Item title={t('imports.summary.rows')} right={() => <Text>{s.rowCount}</Text>} />
        <List.Item title={t('imports.summary.create')} right={() => <Text>{s.createCount}</Text>} />
        <List.Item title={t('imports.summary.update')} right={() => <Text>{s.updateCount}</Text>} />
        <List.Item title={t('imports.summary.skipped')} right={() => <Text>{s.skipCount}</Text>} />
        <List.Item title={t('imports.summary.errors')} right={() => <Text>{s.errorCount}</Text>} />
      </Card>
      {state.unmappedHeaders.length > 0 ? (
        <Text variant="bodySmall">
          {t('imports.ignoredColumns', { columns: state.unmappedHeaders.join(', ') })}
        </Text>
      ) : null}

      {s.errorCount > 0 ? (
        <Text variant="titleMedium" style={styles.gap}>
          {t('imports.fixTitle')}
        </Text>
      ) : null}
      {state.problemRows.map((row) => (
        <ProblemRow key={row.rowId} row={row} state={state} actions={actions} />
      ))}

      {error}
      <Button
        mode="contained"
        onPress={actions.commit}
        disabled={!state.canCommit}
        contentStyle={styles.button}
        style={styles.gap}
      >
        {t('imports.commit', { count: s.createCount + s.updateCount })}
      </Button>
      <Button mode="text" onPress={actions.startOver}>
        {t('imports.startOver')}
      </Button>
    </ScrollView>
  );
}

function ProblemRow({
  row,
  state,
  actions,
}: {
  row: ImportRow;
  state: ReturnType<typeof useImportViewModel>['state'];
  actions: ReturnType<typeof useImportViewModel>['actions'];
}) {
  const { t } = useTranslation();
  const edit = state.edits[row.rowId] ?? {};
  const busy = state.busyRowId !== null;
  return (
    <Card style={styles.rowCard}>
      <Card.Title
        title={t('imports.row', { number: row.rowNumber, name: row.raw.name ?? '—' })}
        subtitle={row.errors.map((e) => t(`imports.rowErrors.${e}`, { defaultValue: e })).join(' · ')}
        subtitleNumberOfLines={3}
      />
      <Card.Content style={styles.rowFields}>
        {EDITABLE.map((field) => (
          <TextInput
            key={field}
            mode="outlined"
            dense
            style={styles.flex}
            label={t(`imports.fields.${field}`)}
            accessibilityLabel={`${t(`imports.fields.${field}`)} ${row.rowNumber}`}
            value={edit[field] ?? row.raw[field] ?? ''}
            onChangeText={(v) => actions.setEdit(row.rowId, field, v)}
          />
        ))}
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => actions.skipRow(row.rowId)} disabled={busy}>
          {t('imports.skip')}
        </Button>
        <Button
          mode="contained"
          onPress={() => actions.saveRow(row.rowId)}
          disabled={busy || Object.keys(edit).length === 0}
          loading={state.busyRowId === row.rowId}
        >
          {t('imports.saveRow')}
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  gap: { marginTop: spacing.md },
  button: { minHeight: 48 },
  rowCard: { marginTop: spacing.xs },
  rowFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  flex: { flexGrow: 1, minWidth: 100 },
});
