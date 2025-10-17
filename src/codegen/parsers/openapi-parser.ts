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
