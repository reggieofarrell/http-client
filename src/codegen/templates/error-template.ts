/**
 * Error Class Template Generator
 *
 * This module generates custom error classes for API-specific error responses
 * when they differ from the standard HttpClient error types.
 */

import { OpenAPIV3 } from 'openapi-types';

/**
 * Configuration for error generation
 */
interface ErrorGenerationOptions {
  /** Whether to generate custom error classes */
  generateCustomErrors: boolean;
  /** Base error class to extend */
  baseErrorClass: string;
}

/**
 * Generate custom error classes from OpenAPI error responses
 *
 * @param spec - OpenAPI specification
 * @param options - Error generation options
 * @returns Generated error class code
 */
export function generateErrorClasses(
  spec: OpenAPIV3.Document,
  options: ErrorGenerationOptions
): string {
  const { generateCustomErrors, baseErrorClass } = options;

  if (!generateCustomErrors) {
    return generateBasicErrorExport();
  }

  // Extract error responses from all operations
  const errorSchemas = extractErrorSchemas(spec);

  if (Object.keys(errorSchemas).length === 0) {
    return generateBasicErrorExport();
  }

  return generateCustomErrorClasses(errorSchemas, baseErrorClass);
}

/**
 * Generate basic error export (no custom errors)
 */
function generateBasicErrorExport(): string {
  return `/**
 * API Error Classes
 *
 * This file exports error classes for the API.
 * Uses standard HttpClient error types.
 */

export {
  HttpClientError,
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError
} from '@reggieofarrell/http-client';`;
}

/**
 * Extract error schemas from OpenAPI specification
 */
function extractErrorSchemas(spec: OpenAPIV3.Document): Record<string, OpenAPIV3.SchemaObject> {
  const errorSchemas: Record<string, OpenAPIV3.SchemaObject> = {};

  // Extract from all operations
  for (const [, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation?.responses) continue;

      // Look for error responses (4xx, 5xx)
      for (const [statusCode, response] of Object.entries(operation.responses)) {
        if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
          if ('$ref' in response) continue;

          const content = response.content;
          if (!content) continue;

          for (const [, mediaType] of Object.entries(content)) {
            if (mediaType.schema && !('$ref' in mediaType.schema)) {
              const errorName = `ApiError${statusCode}`;
              errorSchemas[errorName] = mediaType.schema;
            }
          }
        }
      }
    }
  }

  return errorSchemas;
}

/**
 * Generate custom error classes
 */
function generateCustomErrorClasses(
  errorSchemas: Record<string, OpenAPIV3.SchemaObject>,
  baseErrorClass: string
): string {
  const imports = generateErrorImports(baseErrorClass);
  const errorClasses = Object.entries(errorSchemas)
    .map(([errorName, schema]) => generateErrorClass(errorName, schema, baseErrorClass))
    .join('\n\n');

  return `${imports}

${errorClasses}`;
}

/**
 * Generate error imports
 */
function generateErrorImports(baseErrorClass: string): string {
  return `/**
 * API Error Classes
 *
 * This file exports custom error classes for API-specific error responses.
 */

import { ${baseErrorClass} } from '@reggieofarrell/http-client';
import { z } from 'zod';`;
}

/**
 * Generate a single error class
 */
function generateErrorClass(
  errorName: string,
  schema: OpenAPIV3.SchemaObject,
  baseErrorClass: string
): string {
  const className = errorName.replace('ApiError', '');
  const properties = extractErrorProperties(schema);
  const constructor = generateErrorConstructor(className, properties);
  const methods = generateErrorMethods(className, properties);

  return `/**
 * ${className} Error
 *
 * Represents a ${className} error response from the API.
 */
export class ${className}Error extends ${baseErrorClass} {
${properties}

${constructor}

${methods}
}`;
}

/**
 * Extract properties from error schema
 */
function extractErrorProperties(schema: OpenAPIV3.SchemaObject): string {
  if (!schema.properties) {
    return '  // No additional properties';
  }

  const properties = Object.entries(schema.properties)
    .map(([name, propSchema]) => {
      const type = getTypeScriptType(propSchema as OpenAPIV3.SchemaObject);
      const description =
        ('description' in propSchema && propSchema.description) || 'Error property';
      return `  /** ${name} - ${description} */\n  ${name}: ${type};`;
    })
    .join('\n\n');

  return properties;
}

/**
 * Generate error constructor
 */
function generateErrorConstructor(className: string, _properties: string): string {
  return `  /**
   * Create a new ${className}Error
   *
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param data - Error response data
   */
  constructor(
    message: string,
    statusCode: number,
    data?: any
  ) {
    super(message, statusCode);

    if (data) {
      Object.assign(this, data);
    }
  }`;
}

/**
 * Generate error methods
 */
function generateErrorMethods(className: string, _properties: string): string {
  return `  /**
   * Get error details as JSON
   * @returns Error details
   */
  toJSON() {
    return {
      name: '${className}Error',
      message: this.message,
      statusCode: this.statusCode,
      ...this
    };
  }

  /**
   * Get error summary
   * @returns Error summary
   */
  getSummary() {
    return \`\${this.statusCode}: \${this.message}\`;
  }`;
}

/**
 * Get TypeScript type from OpenAPI schema
 */
function getTypeScriptType(schema: OpenAPIV3.SchemaObject): string {
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'any[]';
    case 'object':
      return 'Record<string, any>';
    default:
      return 'any';
  }
}
