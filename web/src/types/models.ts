import type { components } from './api';


// Barrel di re-export dei tipi del contratto API.
// Scopo: unico punto di import per i tipi delle richieste, così il resto
// dell'app non dipende dalla struttura interna di api.ts (auto-generato da
// openapi-typescript) e una sua rigenerazione si assorbe qui in un punto solo.
export type GenerateRequest = components['schemas']['GenerateRequest'];
export type LinkRequest = components['schemas']['LinkRequest'];
export type TextRequest = components['schemas']['TextRequest'];
export type TranslateRequest = components['schemas']['TranslateRequest'];
export type RewriteRequest = components['schemas']['RewriteRequest'];
export type GrammarRequest = components['schemas']['GrammarRequest'];
export type CritiqueRequest = components['schemas']['CritiqueRequest'];
export type ValidationError = components['schemas']['ValidationError'];
export type HTTPValidationError = components['schemas']['HTTPValidationError'];

// Enum del contratto, usati dai dropdown della UI.
export type Language = TranslateRequest['target_language'];
export type Style = RewriteRequest['style'];
export type Hat = CritiqueRequest['hat'];
export type Length = TextRequest['length'];

export type ApiConstants = components['schemas']['ApiConstants'];

/**
 * Sentinella emessa da /api/grammar quando non trova errori.
 *
 * Il tipo arriva dal contratto: se il backend cambia il valore, `pnpm
 * types:gen` seguito da `tsc` fa fallire la compilazione.
 */
export const NO_ERRORS_MARKER: ApiConstants['no_errors_marker'] =
  'NESSUN_ERRORE_RILEVATO';
