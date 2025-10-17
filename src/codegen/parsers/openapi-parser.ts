/**
 * OpenAPI Specification Parser
 *
 * This module handles parsing OpenAPI 3.0+ specifications from various sources
 * and provides utilities for extracting operations, schemas, and metadata.
 */

import { promises as fs } from 'fs';
import { OpenAPIV3 } from 'openapi-types';

/**
 * Parse an OpenAPI specification from a file path or object
 *
 * @param spec - File path to OpenAPI spec or parsed object
 * @returns Parsed OpenAPI specification
 * @throws {Error} When the spec cannot be parsed or is invalid
 */
export async function parseOpenApiSpec(spec: string | object): Promise<OpenAPIV3.Document> {
  let specData: any;

  if (typeof spec === 'string') {
    // Read from file
    const content = await fs.readFile(spec, 'utf-8');

    if (spec.endsWith('.yaml') || spec.endsWith('.yml')) {
      // Parse YAML - we'll need a YAML parser for this
      throw new Error('YAML parsing not yet implemented. Please use JSON format.');
    } else {
      // Parse JSON
      try {
        specData = JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse JSON from ${spec}: ${error}`);
      }
    }
  } else {
    // Use provided object
    specData = spec;
  }

  // Validate basic OpenAPI structure
  if (!specData.openapi) {
    throw new Error('Invalid OpenAPI specification: missing openapi version');
  }

  if (!specData.info) {
    throw new Error('Invalid OpenAPI specification: missing info section');
  }

  if (!specData.paths) {
    throw new Error('Invalid OpenAPI specification: missing paths section');
  }

  return specData as OpenAPIV3.Document;
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
