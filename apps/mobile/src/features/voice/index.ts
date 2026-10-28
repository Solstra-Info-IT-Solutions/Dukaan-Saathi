// Public API of the voice billing feature (speech → parsed phrases → matched draft lines → confirm).
export type { VoiceLine, VoiceProduct } from './domain/matcher';
export { parseUtterance } from './domain/parser';
export {
  type AliasLearner,
  DraftFromSpeech,
  LearnAlias,
  type VoiceCatalogue,
} from './domain/usecases/voiceUseCases';
export { VoiceBillingSheet } from './presentation/components/VoiceBillingSheet';
export type {
  ConfirmedVoiceLine,
  VoiceBillingViewModelDeps,
} from './presentation/viewmodels/useVoiceBillingViewModel';
