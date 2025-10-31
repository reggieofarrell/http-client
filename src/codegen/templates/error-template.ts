/**
 * Error Class Template Generator
 *
 * Generates custom error classes for API-specific error responses
 * that have additional fields beyond standard HttpError properties.
 */

import { OpenAPIV3 } from 'openapi-types';
import { toPascalCase } from '../utils/naming.js';

/**
 * Represents a custom error schema found in the OpenAPI spec
 */
interface CustomErrorSchema {
  /** HTTP status code pattern (e.g., '404', '4XX', '5XX') */
  statusCode: string;
  /** Schema name from OpenAPI spec (e.g., 'error_400', 'orders.patch-400') */
  schemaName: string;
  /** The error schema */
  schema: OpenAPIV3.SchemaObject;
  /** Additional properties beyond standard error fields */
  customProperties: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}

/**
 * Check if an error schema has custom properties beyond standard HTTP error fields
 */
function hasCustomErrorProperties(schema: OpenAPIV3.SchemaObject): boolean {
  // If schema has properties, it's implicitly an object (even without explicit type)
  if (!schema.properties) {
    return false;
  }

  // If type is explicitly set and not 'object', skip it
  if (schema.type && schema.type !== 'object') {
    return false;
  }

  const standardFields = new Set(['message', 'status', 'statusText', 'error']);
  const schemaProps = Object.keys(schema.properties);

  // Check if there are any properties beyond standard ones
  return schemaProps.some(prop => !standardFields.has(prop));
}

/**
 * Extract custom error schemas from OpenAPI spec
 */
export function extractCustomErrorSchemas(spec: OpenAPIV3.Document): CustomErrorSchema[] {
  const customErrors: Map<string, CustomErrorSchema> = new Map();

  // Iterate through all paths and operations
  Object.entries(spec.paths || {}).forEach(([_path, pathItem]) => {
    if (!pathItem) return;

    const operations = [
      pathItem.get,
      pathItem.post,
      pathItem.put,
      pathItem.patch,
      pathItem.delete,
      pathItem.options,
      pathItem.head,
    ].filter(Boolean) as OpenAPIV3.OperationObject[];

    operations.forEach(operation => {
      if (!operation.responses) return;

      // Check error responses (4xx, 5xx)
      Object.entries(operation.responses).forEach(([statusCode, response]) => {
        if (!statusCode.match(/^[45]\d{2}$/)) return;
        if ('$ref' in response) return;

        const content = response.content?.['application/json'];
        if (!content || !content.schema) return;

        let schema: OpenAPIV3.SchemaObject;

        // Resolve $ref if present
        if ('$ref' in content.schema) {
          const refPath = content.schema.$ref.replace('#/components/schemas/', '');
          schema = spec.components?.schemas?.[refPath] as OpenAPIV3.SchemaObject;
          if (!schema) return;
        } else {
          schema = content.schema as OpenAPIV3.SchemaObject;
        }

        // Check if this error has custom properties
        if (!hasCustomErrorProperties(schema)) return;

        // Extract custom properties
        const customProperties = extractCustomProperties(schema);
        if (customProperties.length === 0) return;

        // Use schema name as key or generate one
        const errorKey =
          '$ref' in content.schema
            ? content.schema.$ref.replace('#/components/schemas/', '')
            : `error_${statusCode}`;

        if (!customErrors.has(errorKey)) {
          customErrors.set(errorKey, {
            statusCode,
            schemaName: errorKey,
            schema,
            customProperties,
          });
        }
      });
    });
  });

  return Array.from(customErrors.values());
}

/**
 * Extract custom properties from error schema
 */
function extractCustomProperties(schema: OpenAPIV3.SchemaObject): Array<{
  name: string;
  type: string;
  required: boolean;
  description?: string;
}> {
  if (!schema.properties) return [];

  const standardFields = new Set(['message', 'status', 'statusText', 'error']);
  const required = new Set(schema.required || []);
  const customProps: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }> = [];

  Object.entries(schema.properties).forEach(([name, prop]) => {
    if (standardFields.has(name)) return;
    if ('$ref' in prop) return; // Skip refs for now

    const propSchema = prop as OpenAPIV3.SchemaObject;
    const type = mapOpenApiTypeToTs(propSchema);

    const customProp: { name: string; type: string; required: boolean; description?: string } = {
      name,
      type,
      required: required.has(name),
    };

    if (propSchema.description) {
      customProp.description = propSchema.description;
    }

    customProps.push(customProp);
  });

  return customProps;
}

/**
 * Map OpenAPI type to TypeScript type
 */
function mapOpenApiTypeToTs(schema: OpenAPIV3.SchemaObject): string {
  if (schema.enum) {
    return schema.enum.map(v => `'${v}'`).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (schema.items && !('$ref' in schema.items)) {
        const itemType = mapOpenApiTypeToTs(schema.items as OpenAPIV3.SchemaObject);
        return `${itemType}[]`;
      }
      return 'any[]';
    case 'object':
      return 'Record<string, any>';
    default:
      return 'any';
  }
}

/**
 * Generate TypeScript interface for error response
 */
export function generateErrorTypeInterface(
  errorSchema: CustomErrorSchema,
  errorName: string
): string {
  const { customProperties } = errorSchema;

  const propertiesCode = customProperties
    .map(prop => {
      const optional = prop.required ? '' : '?';
      const comment = prop.description ? `\n  /** ${prop.description} */` : '';
      return `${comment}\n  ${prop.name}${optional}: ${prop.type};`;
    })
    .join('\n');

  return `/**
 * ${errorName} - Error response type from API
 *
 * Type definition for error responses with custom fields
 */
export interface ${errorName} {${propertiesCode}
}`;
}

/**
 * Generate a meaningful TypeScript interface name from schema name
 *
 * @param schemaName - Schema name from OpenAPI (e.g., 'error_400', 'orders.patch-400')
 * @returns PascalCase interface name (e.g., 'Error400', 'OrdersPatch400')
 */
function generateErrorInterfaceName(schemaName: string): string {
  // Split on dots, underscores, hyphens
  const parts = schemaName.split(/[._-]+/);

  // Convert each part to PascalCase and join
  const pascalParts = parts.map(part => {
    // Handle numeric suffixes (e.g., '400' stays as '400')
    if (/^\d+$/.test(part)) {
      return part;
    }
    return toPascalCase(part);
  });

  return pascalParts.join('');
}

/**
 * Generate error types file
 */
export function generateErrorTypes(customErrors: CustomErrorSchema[]): string | null {
  if (customErrors.length === 0) {
    return null;
  }

  const errorTypes = customErrors
    .map(errorSchema => {
      const errorName = generateErrorInterfaceName(errorSchema.schemaName);
      return generateErrorTypeInterface(errorSchema, errorName);
    })
    .join('\n\n');

  return `/**
 * Generated Error Response Types
 *
 * These types represent the structure of error responses from the API.
 * Use them to type-cast error.response.data for type-safe error handling.
 *
 * @example
 * try {
 *   await client.users.getUser({ id: '123' });
 * } catch (error) {
 *   if (error instanceof HttpError) {
 *     const errorData = error.response.data as Error400;
 *     console.error('Error details:', errorData.details);
 *   }
 * }
 */

${errorTypes}
`;
}
