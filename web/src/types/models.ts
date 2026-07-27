import type { components } from './api';


// Barrel di re-export dei tipi del contratto API.
// Scopo: unico punto di import per i tipi delle richieste, così il resto
// dell'app non dipende dalla struttura interna di api.ts (auto-generato da
// openapi-typescript) e una sua rigenerazione si assorbe qui in un punto solo.
export type GenerateRequest = components['schemas']['GenerateRequest'];
export type LinkRequest = components['schemas']['LinkRequest'];
export type TextRequest = components['schemas']['TextRequest'];
export type ValidationError = components['schemas']['ValidationError'];
export type HTTPValidationError = components['schemas']['HTTPValidationError'];