import type {
  CatalogueReferenceDto,
  CategoryDto,
  ProductDto,
  ProductPageDto,
  TaxRateDto,
  UnitDto,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Product = ProductDto;
export type ProductPage = ProductPageDto;
export type CatalogueReference = CatalogueReferenceDto;
export type Category = CategoryDto;
export type Unit = UnitDto;
export type TaxRate = TaxRateDto;

export interface ProductQuery {
  query: string;
  categoryId: string | null;
  offset: number;
  limit: number;
}

/** What the product form edits: text as typed, converted by SaveProduct. */
export interface ProductDraft {
  id: string | null;
  name: string;
  nameHi: string;
  categoryId: string | null;
  unitCode: string;
  priceText: string;
  mrpText: string;
  taxRateCode: string | null;
  hsnCode: string;
  barcodesText: string;
  aliasesText: string;
}

export const emptyProductDraft: ProductDraft = {
  id: null,
  name: '',
  nameHi: '',
  categoryId: null,
  unitCode: 'pc',
  priceText: '',
  mrpText: '',
  taxRateCode: null,
  hsnCode: '',
  barcodesText: '',
  aliasesText: '',
};
