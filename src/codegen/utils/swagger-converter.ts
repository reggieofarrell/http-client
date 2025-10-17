/**
 * Swagger 2.0 to OpenAPI 3.0+ Converter Utility
 *
 * This module handles detection and conversion of Swagger 2.0 specifications
 * to OpenAPI 3.0+ format using the swagger2openapi library.
 * Uses dynamic imports to avoid bundling when not needed.
 */

import { OpenAPIV3 } from 'openapi-types';

/**
 * Check if a specification is in Swagger 2.0 format
 *
 * @param spec - The specification object to check
 * @returns True if the spec is Swagger 2.0, false otherwise
 */
export function isSwagger2(spec: any): boolean {
  return spec && typeof spec === 'object' && spec.swagger === '2.0';
}

/**
 * Convert a Swagger 2.0 specification to OpenAPI 3.0+ format
 *
 * @param spec - The Swagger 2.0 specification object
 * @returns Promise resolving to OpenAPI 3.0+ document
 * @throws {Error} When swagger2openapi is not installed or conversion fails
 */
export async function convertSwagger2ToOpenAPI3(spec: object): Promise<OpenAPIV3.Document> {
  try {
    // Dynamic import to avoid bundling when not needed
    const swagger2openapi = await import('swagger2openapi');

    // Convert Swagger 2.0 to OpenAPI 3.0+
    const options = {
      patch: true, // Apply patches to fix common issues
      warnPropertyMissing: true, // Warn about missing properties
    };

    const result = await swagger2openapi.convertObj(spec as any, options);

    // Return the converted OpenAPI 3.0+ document
    return result.openapi;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot resolve module')) {
      throw new Error(
        'swagger2openapi is required for Swagger 2.0 specifications. ' +
          'Please install it as a peer dependency: npm install swagger2openapi'
      );
    }

    throw new Error(`Failed to convert Swagger 2.0 to OpenAPI 3.0: ${error}`);
  }
}

/**
 * Detect specification format and convert if necessary
 *
 * @param spec - The specification object (Swagger 2.0 or OpenAPI 3.0+)
 * @returns Promise resolving to OpenAPI 3.0+ document
 * @throws {Error} When conversion fails or spec is invalid
 */
export async function ensureOpenAPI3(spec: any): Promise<OpenAPIV3.Document> {
  // Check if it's already OpenAPI 3.0+
  if (spec && typeof spec === 'object' && spec.openapi) {
    return spec as OpenAPIV3.Document;
  }

  // Check if it's Swagger 2.0 and convert
  if (isSwagger2(spec)) {
    console.log('🔄 Detected Swagger 2.0 specification, converting to OpenAPI 3.0+...');
    return await convertSwagger2ToOpenAPI3(spec);
  }

  // If neither format is detected, throw an error
  throw new Error(
    'Invalid specification format. Expected OpenAPI 3.0+ or Swagger 2.0 specification. ' +
      'Make sure your spec has either "openapi" or "swagger" field.'
  );
}
