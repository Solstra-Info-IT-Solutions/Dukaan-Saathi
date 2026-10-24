import { SaveProductInputSchema, type SaveProductInput } from '@ds/contracts';
import { parseRupeesToPaise } from '@ds/domain-core';
import type {
  CatalogueReference,
  Product,
  ProductDraft,
  ProductPage,
  ProductQuery,
} from '../entities/Catalogue';
import type { CatalogueRepository } from '../repositories/CatalogueRepository';

/** Field → issue code (e.g. { priceText: 'INVALID_PRICE' }). */
export class CatalogueInputError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('CatalogueInputError');
    this.name = 'CatalogueInputError';
  }
}

/** "a, b\nc" → ["a", "b", "c"], de-duplicated, case-insensitive for aliases. */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

export function productToDraft(p: Product): ProductDraft {
  const rupees = (paise: number | null) =>
    paise === null ? '' : (paise / 100).toFixed(2).replace(/\.00$/, '');
  return {
    id: p.id,
    name: p.name,
    nameHi: p.nameHi ?? '',
    categoryId: p.categoryId,
    unitCode: p.unitCode,
    priceText: rupees(p.pricePaise),
    mrpText: rupees(p.mrpPaise),
    taxRateCode: p.taxRateCode,
    hsnCode: p.hsnCode ?? '',
    barcodesText: p.barcodes.join(', '),
    aliasesText: p.aliases.join(', '),
  };
}

/** Converts the form draft into the save_product payload, or throws CatalogueInputError. */
export function draftToInput(draft: ProductDraft, newId: () => string): SaveProductInput {
  const fields: Record<string, string> = {};
  const price = parseRupeesToPaise(draft.priceText);
  if (draft.priceText.trim() === '') fields.priceText = 'PRICE_REQUIRED';
  else if (price === null) fields.priceText = 'INVALID_PRICE';
  const mrp = draft.mrpText.trim() === '' ? null : parseRupeesToPaise(draft.mrpText);
  if (draft.mrpText.trim() !== '' && mrp === null) fields.mrpText = 'INVALID_PRICE';
  if (Object.keys(fields).length > 0) throw new CatalogueInputError(fields);

  const candidate = {
    id: draft.id ?? newId(),
    name: draft.name,
    nameHi: draft.nameHi.trim() || null,
    categoryId: draft.categoryId,
    unitCode: draft.unitCode,
    pricePaise: price ?? 0,
    mrpPaise: mrp,
    taxRateCode: draft.taxRateCode,
    hsnCode: draft.hsnCode.trim() || null,
    barcodes: splitList(draft.barcodesText),
    aliases: splitList(draft.aliasesText),
  };
  const parsed = SaveProductInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const map: Record<string, string> = {
      name: 'name',
      nameHi: 'nameHi',
      pricePaise: 'priceText',
      mrpPaise: 'mrpText',
      hsnCode: 'hsnCode',
      barcodes: 'barcodesText',
      aliases: 'aliasesText',
    };
    for (const issue of parsed.error.issues) {
      const key = map[String(issue.path[0])] ?? 'form';
      fields[key] ??= issue.message;
    }
    throw new CatalogueInputError(fields);
  }
  return parsed.data;
}

export class SearchProducts {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string, query: ProductQuery): Promise<ProductPage> {
    return this.catalogue.searchProducts(shopId, { ...query, query: query.query.trim() });
  }
}

export class GetProduct {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string, productId: string): Promise<Product> {
    return this.catalogue.getProduct(shopId, productId);
  }
}

/** Saves a new or existing product. The id is generated once per draft, so retries are idempotent. */
export class SaveProduct {
  constructor(
    private readonly catalogue: CatalogueRepository,
    private readonly newId: () => string,
  ) {}
  execute(shopId: string, draft: ProductDraft): Promise<Product> {
    return this.catalogue.saveProduct(shopId, draftToInput(draft, this.newId));
  }
}

export class ArchiveProduct {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string, productId: string): Promise<void> {
    return this.catalogue.archiveProduct(shopId, productId);
  }
}

export class LoadCatalogueReference {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string): Promise<CatalogueReference> {
    return this.catalogue.getReference(shopId);
  }
}

export class SaveCategory {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string, id: string | null, name: string, nameHi = ''): Promise<string> {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) throw new CatalogueInputError({ name: 'CATEGORY_NAME' });
    return this.catalogue.saveCategory(shopId, { id, name: trimmed, nameHi: nameHi.trim() || null });
  }
}

export class ArchiveCategory {
  constructor(private readonly catalogue: CatalogueRepository) {}
  execute(shopId: string, categoryId: string): Promise<void> {
    return this.catalogue.archiveCategory(shopId, categoryId);
  }
}
