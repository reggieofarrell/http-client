/**
 * OpenAPI to SDK Code Generator
 *
 * This module provides functionality to generate strongly-typed SDK clients
 * from OpenAPI 3.0+ specifications using Zod schemas.
 *
 * @example
 * ```typescript
 * import { generateClient } from '@reggieofarrell/http-client/codegen';
 *
 * await generateClient({
 *   openApiSpec: './openapi.json',
 *   outputDir: './src/api-client',
 *   clientName: 'MyApiClient',
 * });
 * ```
 */

export { generateClient } from './generator.js';
export type { GenerateClientOptions } from './generator.js';
