// Public API of the catalogue feature.
export type { CatalogueRepository } from './domain/repositories/CatalogueRepository';
export {
  ArchiveCategory,
  ArchiveProduct,
  GetProduct,
  LoadCatalogueReference,
  SaveCategory,
  SaveProduct,
  SearchProducts,
} from './domain/usecases/catalogueUseCases';
export { CatalogueRepositoryImpl } from './data/repositories/CatalogueRepositoryImpl';
export { SupabaseCatalogueDataSource } from './data/datasources/remote/SupabaseCatalogueDataSource';
export { ProductsScreen } from './presentation/screens/ProductsScreen';
export { ProductFormScreen } from './presentation/screens/ProductFormScreen';
export { CategoriesScreen } from './presentation/screens/CategoriesScreen';
export type { ProductsViewModelDeps } from './presentation/viewmodels/useProductsViewModel';
export type { ProductFormViewModelDeps } from './presentation/viewmodels/useProductFormViewModel';
export type { CategoriesViewModelDeps } from './presentation/viewmodels/useCategoriesViewModel';
export { catalogueKeys } from './presentation/catalogueKeys';
