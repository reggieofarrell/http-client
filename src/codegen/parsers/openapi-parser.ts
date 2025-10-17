/**
 * OpenAPI Specification Parser
 *
 * This module handles parsing OpenAPI 3.0+ specifications from various sources
 * and provides utilities for extracting operations, schemas, and metadata.
 * Supports multi-file specifications with external $ref resolution.
 */

import { promises as fs } from 'fs';
import { OpenAPIV3 } from 'openapi-types';
import { ensureOpenAPI3 } from '../utils/swagger-converter.js';

/**
 * Parse an OpenAPI specification from a file path or object
 * Supports both OpenAPI 3.0+ and Swagger 2.0 specifications
 * Automatically resolves external $ref references in multi-file specifications
 *
 * @param spec - File path to OpenAPI/Swagger spec or parsed object
 * @returns Parsed and resolved OpenAPI 3.0+ specification
 * @throws {Error} When the spec cannot be parsed or is invalid
 */
export async function parseOpenApiSpec(spec: string | object): Promise<OpenAPIV3.Document> {
  let specData: any;
  let specPath: string | undefined;
  let originalContent: string | undefined;

  if (typeof spec === 'string') {
    specPath = spec;
    // Read from file
    originalContent = await fs.readFile(spec, 'utf-8');

    if (spec.endsWith('.yaml') || spec.endsWith('.yml')) {
      // Parse YAML
      try {
        const yaml = await import('yaml');
        specData = yaml.parse(originalContent);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot resolve module')) {
          throw new Error(
            'yaml is required for YAML specifications. ' +
              'Please install it as a peer dependency: npm install yaml'
          );
        }
        throw new Error(`Failed to parse YAML from ${spec}: ${error}`);
      }
    } else {
      // Parse JSON
      try {
        specData = JSON.parse(originalContent);
      } catch (error) {
        throw new Error(`Failed to parse JSON from ${spec}: ${error}`);
      }
    }
  } else {
    // Use provided object
    specData = spec;
  }

  // Resolve external $ref references in multi-file specifications
  try {
    const $RefParser = await import('@apidevtools/json-schema-ref-parser');

    // Check if spec contains any external $ref (file paths or URLs, not internal #/ refs)
    // Check both the string content and the parsed data
    const contentToCheck = originalContent || JSON.stringify(specData);
    const hasExternalFileRefs =
      contentToCheck.includes('./') &&
      (contentToCheck.includes('$ref') || contentToCheck.includes('"$ref"'));

    if (hasExternalFileRefs) {
      // Dereference all $refs (local files + HTTP/HTTPS)
      // Pass the file path if available so relative refs are resolved correctly
      specData = await $RefParser.default.dereference(specPath || specData, {
        resolve: {
          file: true, // Enable local file references
          http: {
            // Enable HTTP/HTTPS references
            timeout: 10000, // 10 second timeout
          },
        },
        dereference: {
          circular: 'ignore', // Handle circular refs gracefully
        },
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot resolve module')) {
      // @apidevtools/json-schema-ref-parser not installed - continue without ref resolution
      // This is fine for single-file specs or when user doesn't need multi-file support
    } else if (error instanceof Error) {
      // Real error during reference resolution
      if (
        error.message.includes('ENOENT') ||
        error.message.includes('not found') ||
        error.message.includes('Unable to resolve')
      ) {
        throw new Error(
          `Failed to resolve external reference: File not found. ` +
            `Make sure all referenced files exist. Original error: ${error.message}`
        );
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('Network')) {
        throw new Error(
          `Failed to resolve external reference: Network error. ` +
            `Check your network connection and URL. Original error: ${error.message}`
        );
      } else if (error.message.includes('Circular')) {
        throw new Error(
          `Circular reference detected in specification. ` + `Original error: ${error.message}`
        );
      } else {
        throw new Error(`Failed to resolve external references: ${error.message}`);
      }
    }
  }

  // Convert Swagger 2.0 to OpenAPI 3.0+ if needed
  const openApiSpec = await ensureOpenAPI3(specData);

  // Validate basic OpenAPI structure
  if (!openApiSpec.openapi) {
    throw new Error('Invalid OpenAPI specification: missing openapi version');
  }

  if (!openApiSpec.info) {
    throw new Error('Invalid OpenAPI specification: missing info section');
  }

  if (!openApiSpec.paths) {
    throw new Error('Invalid OpenAPI specification: missing paths section');
  }

  return openApiSpec;
}

/**
 * Extract all operations from an OpenAPI specification
 *
 * @param spec - Parsed OpenAPI specification
 * @returns Array of operation objects with metadata
 */
export function extractOperations(spec: OpenAPIV3.Document): Array<{
  method: string;
  path: string;
  operation: OpenAPIV3.OperationObject;
  pathItem: OpenAPIV3.PathItemObject;
}> {
  const operations: Array<{
    method: string;
    path: string;
    operation: OpenAPIV3.OperationObject;
    pathItem: OpenAPIV3.PathItemObject;
  }> = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (operation) {
        operations.push({
          method: method.toUpperCase(),
          path,
          operation,
          pathItem,
        });
      }
    }
  }

  return operations;
}

/**
 * Extract all schemas from an OpenAPI specification
 *
 * @param spec - Parsed OpenAPI specification
 * @returns Map of schema name to schema object
 */
export function extractSchemas(spec: OpenAPIV3.Document): Record<string, OpenAPIV3.SchemaObject> {
  const schemas: Record<string, OpenAPIV3.SchemaObject> = {};

  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      if (schema && typeof schema === 'object') {
        schemas[name] = schema as OpenAPIV3.SchemaObject;
      }
    }
  }

  return schemas;
}

/**
 * Resolve a schema reference ($ref) to the actual schema
 *
 * @param ref - Reference string (e.g., "#/components/schemas/User")
 * @param spec - OpenAPI specification
 * @returns Resolved schema object
 */
export function resolveSchemaRef(
  ref: string,
  spec: OpenAPIV3.Document
): OpenAPIV3.SchemaObject | null {
  if (!ref.startsWith('#')) {
    return null; // External references not supported yet
  }

  const path = ref.substring(1).split('/');
  let current: any = spec;

  for (const segment of path) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }

  return current as OpenAPIV3.SchemaObject;
}

/**
 * Attempt to detect the error message path from OpenAPI error response schemas
 * Analyzes 4xx and 5xx response schemas to find common error message fields
 *
 * @param spec - Parsed OpenAPI specification
 * @returns Detected error message path or undefined
 */
export function detectErrorMessagePath(spec: OpenAPIV3.Document): string | undefined {
  const errorPaths = new Map<string, number>(); // path -> count
  const operations = extractOperations(spec);

  for (const { operation } of operations) {
    if (!operation.responses) continue;

    // Check error response codes (4xx, 5xx)
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      const status = parseInt(statusCode);
      if (status < 400) continue;

      // Analyze the response schema
      const schema = extractResponseSchema(response);
      if (schema) {
        const paths = findMessagePaths(schema);
        paths.forEach(path => {
          errorPaths.set(path, (errorPaths.get(path) || 0) + 1);
        });
      }
    }
  }

  // Return most common path
  if (errorPaths.size === 0) return undefined;

  let mostCommon = '';
  let maxCount = 0;
  for (const [path, count] of errorPaths.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = path;
    }
  }

  return mostCommon || undefined;
}

/**
 * Recursively find paths to fields named: message, error, detail, etc.
 * Returns array of paths like ['data.message', 'data.error.message']
 */
function findMessagePaths(schema: any, prefix = 'data'): string[] {
  const paths: string[] = [];

  if (!schema || typeof schema !== 'object') {
    return paths;
  }

  // Check for direct message fields in properties
  if (schema.properties) {
    const messageFields = ['message', 'error', 'detail', 'description', 'msg'];
    for (const field of messageFields) {
      if (schema.properties[field]) {
        paths.push(`${prefix}.${field}`);
      }
    }

    // Check for nested objects
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value && typeof value === 'object') {
        const nestedPaths = findMessagePaths(value, `${prefix}.${key}`);
        paths.push(...nestedPaths);
      }
    }
  }

  // Check for array items
  if (schema.items) {
    const itemPaths = findMessagePaths(schema.items, `${prefix}.0`);
    paths.push(...itemPaths);
  }

  // Check for allOf, oneOf, anyOf
  const unionTypes = ['allOf', 'oneOf', 'anyOf'];
  for (const unionType of unionTypes) {
    if (schema[unionType] && Array.isArray(schema[unionType])) {
      for (const item of schema[unionType]) {
        const itemPaths = findMessagePaths(item, prefix);
        paths.push(...itemPaths);
      }
    }
  }

  return paths;
}

/**
 * Extract schema from response object (handle $ref, content types, etc.)
 */
function extractResponseSchema(response: any): any {
  if (!response) return null;

  // Handle $ref
  if (response.$ref) {
    // For now, we'll skip $ref resolution as it requires full spec traversal
    return null;
  }

  // Handle content types
  if (response.content) {
    // Look for JSON content first
    const jsonContent = response.content['application/json'];
    if (jsonContent?.schema) {
      return jsonContent.schema;
    }

    // Fall back to any content type
    const firstContent = Object.values(response.content)[0] as any;
    if (firstContent?.schema) {
      return firstContent.schema;
    }
  }

  // Direct schema
  if (response.schema) {
    return response.schema;
  }

  return null;
}
