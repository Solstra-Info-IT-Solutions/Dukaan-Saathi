import type { SaveProductInput } from '@ds/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import {
  type CatalogueReference,
  emptyProductDraft,
  type Product,
  type ProductQuery,
} from '../domain/entities/Catalogue';
import type { CatalogueRepository } from '../domain/repositories/CatalogueRepository';
import {
  ArchiveCategory,
  ArchiveProduct,
  CatalogueInputError,
  draftToInput,
  GetProduct,
  LoadCatalogueReference,
  productToDraft,
  SaveCategory,
  SaveProduct,
  SearchProducts,
  splitList,
} from '../domain/usecases/catalogueUseCases';
import { CategoriesScreen } from '../presentation/screens/CategoriesScreen';
import { ProductsScreen } from '../presentation/screens/ProductsScreen';
import { useProductFormViewModel } from '../presentation/viewmodels/useProductFormViewModel';

const ID_1 = '0190f0f0-0000-7000-8000-0000000000e1';
const ID_2 = '0190f0f0-0000-7000-8000-0000000000e2';
const CAT = '0190f0f0-0000-7000-8000-0000000000c9';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: ID_1,
    name: 'Sugar 1kg',
    nameHi: 'चीनी',
    categoryId: null,
    unitCode: 'pc',
    pricePaise: 4500,
    mrpPaise: null,
    lastCostPaise: null,
    taxRateCode: null,
    hsnCode: null,
    trackStock: false,
    stockOnHandMilli: 0,
    lowStockThresholdMilli: null,
    isActive: true,
    barcodes: ['8901234567890'],
    aliases: ['cheeni'],
    updatedAt: '2026-10-24T00:00:00Z',
    ...overrides,
  };
}

class FakeCatalogueRepository implements CatalogueRepository {
  products: Product[] = [
    product(),
    product({ id: ID_2, name: 'Salt', nameHi: null, pricePaise: 2800, barcodes: [], aliases: [] }),
  ];
  categories = [{ id: CAT, name: 'Grocery', nameHi: null }];
  queries: ProductQuery[] = [];
  saved: SaveProductInput[] = [];
  saveError: unknown = null;
  log: string[] = [];

  async searchProducts(_shopId: string, q: ProductQuery) {
    this.queries.push(q);
    const items = this.products.filter(
      (p) => !q.query || p.name.toLowerCase().includes(q.query.toLowerCase()),
    );
    return { items, nextOffset: null };
  }
  async getProduct(_s: string, id: string) {
    const p = this.products.find((x) => x.id === id);
    if (!p) throw new AppError('DS_NOT_FOUND');
    return p;
  }
  async saveProduct(_s: string, input: SaveProductInput) {
    this.saved.push(input);
    if (this.saveError) throw this.saveError;
    return product({
      ...input,
      lastCostPaise: null,
      trackStock: false,
      stockOnHandMilli: 0,
      lowStockThresholdMilli: null,
      isActive: true,
      updatedAt: 'x',
    });
  }
  async archiveProduct(_s: string, id: string) {
    this.log.push(`archive:${id}`);
  }
  async addAlias(_s: string, id: string, alias: string) {
    this.log.push(`alias:${id}:${alias}`);
  }
  async getReference(): Promise<CatalogueReference> {
    return {
      units: [
        { code: 'pc', label: { en: 'Piece', hi: 'नग' }, allowsFraction: false },
        { code: 'kg', label: { en: 'Kilogram', hi: 'किलो' }, allowsFraction: true },
      ],
      taxRates: [{ code: 'GST_5', rateBp: 500, label: 'GST 5%' }],
      categories: this.categories,
    };
  }
  async saveCategory(_s: string, c: { id: string | null; name: string }) {
    this.log.push(`category:${c.id ?? 'new'}:${c.name}`);
    if (c.id === null) this.categories = [...this.categories, { id: ID_2, name: c.name, nameHi: null }];
    return c.id ?? ID_2;
  }
  async archiveCategory(_s: string, id: string) {
    this.log.push(`archiveCategory:${id}`);
  }
}

describe('draft conversion', () => {
  it('converts rupees to paise and splits lists', () => {
    const input = draftToInput(
      {
        ...emptyProductDraft,
        id: ID_1,
        name: ' Sugar ',
        priceText: '₹45.50',
        mrpText: '48',
        barcodesText: '8901234567890, 8901234567890',
        aliasesText: 'cheeni\nShakkar, CHEENI',
      },
      () => 'unused',
    );
    expect(input).toMatchObject({
      id: ID_1,
      name: 'Sugar',
      pricePaise: 4550,
      mrpPaise: 4800,
      barcodes: ['8901234567890'],
      aliases: ['cheeni', 'Shakkar'],
    });
  });
  it('reports field errors', () => {
    try {
      draftToInput({ ...emptyProductDraft, name: '', priceText: 'abc' }, () => ID_1);
      throw new Error('expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogueInputError);
      expect((e as CatalogueInputError).fields).toEqual({ priceText: 'INVALID_PRICE' });
    }
    try {
      draftToInput({ ...emptyProductDraft, name: '', priceText: '10', hsnCode: '12' }, () => ID_1);
      throw new Error('expected an error');
    } catch (e) {
      expect((e as CatalogueInputError).fields).toMatchObject({
        name: 'NAME_REQUIRED',
        hsnCode: 'INVALID_HSN',
      });
    }
  });
  it('round-trips a product through the draft', () => {
    const p = product({ mrpPaise: 5000 });
    expect(draftToInput(productToDraft(p), () => 'x')).toMatchObject({
      pricePaise: 4500,
      mrpPaise: 5000,
      nameHi: 'चीनी',
    });
  });
  it('splits comma and newline lists', () => {
    expect(splitList(' a, b\n\nc ,A ')).toEqual(['a', 'b', 'c']);
  });
});

function formDeps(repo: FakeCatalogueRepository) {
  return {
    getProduct: new GetProduct(repo),
    saveProduct: new SaveProduct(repo, () => 'should-not-be-used'),
    archiveProduct: new ArchiveProduct(repo),
    loadReference: new LoadCatalogueReference(repo),
    newId: () => ID_2,
  };
}

describe('useProductFormViewModel', () => {
  it('keeps the same product id when a failed save is retried', async () => {
    const repo = new FakeCatalogueRepository();
    repo.saveError = new AppError('NETWORK_TIMEOUT');
    const onDone = jest.fn();
    const { result } = await renderHookWithQuery(() =>
      useProductFormViewModel(formDeps(repo), SHOP_A, null, onDone),
    );
    await act(async () => {
      result.current.form.setValue('name', 'Atta 5kg');
      result.current.form.setValue('priceText', '250');
    });
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(result.current.state.errorKey).toBe('errors.NETWORK_TIMEOUT'));
    repo.saveError = null;
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(repo.saved.map((s) => s.id)).toEqual([ID_2, ID_2]);
  });

  it('shows field errors without calling the server', async () => {
    const repo = new FakeCatalogueRepository();
    const { result } = await renderHookWithQuery(() =>
      useProductFormViewModel(formDeps(repo), SHOP_A, null, jest.fn()),
    );
    await act(async () => result.current.form.setValue('name', 'Atta'));
    await act(async () => result.current.actions.submit());
    await waitFor(() =>
      expect(result.current.form.getFieldState('priceText').error?.message).toBe('PRICE_REQUIRED'),
    );
    expect(repo.saved).toHaveLength(0);
  });

  it('loads an existing product into the form', async () => {
    const repo = new FakeCatalogueRepository();
    const { result } = await renderHookWithQuery(() =>
      useProductFormViewModel(formDeps(repo), SHOP_A, ID_1, jest.fn()),
    );
    await waitFor(() => expect(result.current.form.getValues('name')).toBe('Sugar 1kg'));
    expect(result.current.form.getValues('priceText')).toBe('45');
  });
});

describe('ProductsScreen', () => {
  it('lists items and searches after the debounce', async () => {
    const repo = new FakeCatalogueRepository();
    const deps = {
      searchProducts: new SearchProducts(repo),
      loadReference: new LoadCatalogueReference(repo),
    };
    await renderWithProviders(
      <ProductsScreen
        deps={deps}
        shopId={SHOP_A}
        canManage={false}
        onOpenProduct={jest.fn()}
        onAddProduct={jest.fn()}
        onOpenCategories={jest.fn()}
        onOpenImport={jest.fn()}
      />,
    );
    expect(await screen.findByText('Sugar 1kg')).toBeOnTheScreen();
    expect(screen.getByText('₹45.00')).toBeOnTheScreen();
    expect(screen.queryByText('Add item')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search by name, Hindi name or barcode'), 'salt');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    // The list may be empty for a moment between the two results, so wait for the new one.
    expect(await screen.findByText('Salt')).toBeOnTheScreen();
    expect(screen.queryByText('Sugar 1kg')).toBeNull();
    expect(repo.queries.at(-1)).toMatchObject({ query: 'salt', offset: 0 });
  });

  it('shows management actions for managers', async () => {
    const repo = new FakeCatalogueRepository();
    const onAddProduct = jest.fn();
    await renderWithProviders(
      <ProductsScreen
        deps={{ searchProducts: new SearchProducts(repo), loadReference: new LoadCatalogueReference(repo) }}
        shopId={SHOP_A}
        canManage
        onOpenProduct={jest.fn()}
        onAddProduct={onAddProduct}
        onOpenCategories={jest.fn()}
        onOpenImport={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByLabelText('Add item'));
    expect(onAddProduct).toHaveBeenCalled();
  });
});

describe('CategoriesScreen', () => {
  it('adds a category', async () => {
    const repo = new FakeCatalogueRepository();
    const deps = {
      loadReference: new LoadCatalogueReference(repo),
      saveCategory: new SaveCategory(repo),
      archiveCategory: new ArchiveCategory(repo),
    };
    await renderWithProviders(<CategoriesScreen deps={deps} shopId={SHOP_A} />);
    expect(await screen.findByText('Grocery')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('New category'), 'Sabzi');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(repo.log).toContain('category:new:Sabzi'));
    expect(await screen.findByText('Sabzi')).toBeOnTheScreen();
  });
});
