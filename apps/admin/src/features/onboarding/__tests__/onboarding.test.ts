import { describe, expect, it } from 'vitest';
import { csvToImport, NEXT_STEPS, type OnboardingStatus, STEP_LABEL } from '../domain/onboarding';

describe('onboarding steps', () => {
  it('matches the database state machine', () => {
    expect(NEXT_STEPS).toEqual({
      new: ['assigned', 'cancelled'],
      assigned: ['in_progress', 'new', 'cancelled'],
      in_progress: ['awaiting_owner', 'cancelled'],
      awaiting_owner: ['in_progress'],
      completed: [],
      cancelled: [],
    });
  });
  it('never offers "completed" (the owner completes it by approving the import)', () => {
    for (const steps of Object.values(NEXT_STEPS)) expect(steps).not.toContain('completed');
  });
  it('has a button label for every offered step', () => {
    const offered = new Set<OnboardingStatus>(Object.values(NEXT_STEPS).flat());
    for (const s of offered) expect(STEP_LABEL[s]).toBeTruthy();
  });
});

describe('csvToImport', () => {
  it('maps headers, drops blank lines and keeps spreadsheet row numbers', () => {
    const r = csvToImport('﻿Item Name,Rate,Unit,Supplier\nSugar,45,kg,Ramesh\n,,,\nSalt,28,,\n');
    expect(r.missingRequired).toEqual([]);
    expect(r.unmappedHeaders).toEqual(['Supplier']);
    expect(r.rowCount).toBe(2);
    expect(r.batches).toEqual([
      [
        { rowNumber: 2, name: 'Sugar', price: '45', unit: 'kg' },
        { rowNumber: 4, name: 'Salt', price: '28' },
      ],
    ]);
  });
  it('reports a missing price column', () => {
    expect(csvToImport('Product,MRP\nTea,10\n').missingRequired).toEqual(['price']);
  });
  it('splits into batches of 1000 rows', () => {
    const lines = ['name,price', ...Array.from({ length: 2500 }, (_, i) => `Item ${i},${i + 1}`)];
    const r = csvToImport(lines.join('\n'));
    expect(r.rowCount).toBe(2500);
    expect(r.batches.map((b) => b.length)).toEqual([1000, 1000, 500]);
  });
});
