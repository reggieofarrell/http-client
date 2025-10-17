/**
 * Route Parser and Grouping
 *
 * This module handles parsing OpenAPI operations and grouping them into
 * logical route groups for SDK generation.
 */

import { OpenAPIV3 } from 'openapi-types';
import { extractOperations } from './openapi-parser.js';
import { toCamelCase, toPascalCase } from '../utils/naming.js';

/**
 * Configuration for route parsing
 */
export interface RouteParsingOptions {
  /** Strategy for grouping routes: 'tags' or 'path' */
  groupingStrategy: 'tags' | 'path';
  /** Whether to include deprecated endpoints */
  includeDeprecated: boolean;
}

/**
 * A parsed route operation
 */
export interface ParsedOperation {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** API path */
  path: string;
  /** Generated method name */
  methodName: string;
  /** Path parameters */
  pathParams: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  /** Query parameters */
  queryParams: Array<{
    name: string;
    type: string;
    required: boolean;
    schema?: OpenAPIV3.SchemaObject | undefined;
  }>;
  /** Request body schema */
  requestBody?:
    | {
        contentType: string;
        schema: OpenAPIV3.SchemaObject;
      }
    | undefined;
  /** Response schemas */
  responses: Array<{
    statusCode: string;
    contentType: string;
    schema?: OpenAPIV3.SchemaObject;
  }>;
  /** Operation metadata */
  operation: OpenAPIV3.OperationObject;
}

/**
 * A group of related routes
 */
export interface RouteGroup {
  /** Group name (e.g., 'users', 'documents') */
  name: string;
  /** Display name for the group */
  displayName: string;
  /** Class name for the route group */
  className: string;
  /** Operations in this group */
  operations: ParsedOperation[];
}

/**
 * Parse routes from an OpenAPI specification and group them
 *
 * @param spec - OpenAPI specification
 * @param options - Parsing options
 * @returns Array of route groups
 */
export function parseRoutes(spec: OpenAPIV3.Document, options: RouteParsingOptions): RouteGroup[] {
  const operations = extractOperations(spec);
  const groups = new Map<string, ParsedOperation[]>();

  // Group operations
  for (const op of operations) {
    // Skip deprecated operations if not included
    if (!options.includeDeprecated && op.operation.deprecated) {
      continue;
    }

    const parsedOp = parseOperation(op, spec);
    const groupName = getGroupName(op, options.groupingStrategy);

    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }

    groups.get(groupName)!.push(parsedOp);
  }

  // Convert groups to RouteGroup objects
  const routeGroups: RouteGroup[] = [];

  for (const [groupName, operations] of groups) {
    if (operations.length === 0) continue;

    const displayName = toPascalCase(groupName);
    const className = `${displayName}RouteGroup`;

    routeGroups.push({
      name: groupName,
      displayName,
      className,
      operations,
    });
  }

  return routeGroups;
}

/**
 * Parse a single operation into a ParsedOperation
 */
function parseOperation(
  op: {
    method: string;
    path: string;
    operation: OpenAPIV3.OperationObject;
    pathItem: OpenAPIV3.PathItemObject;
  },
  _spec: OpenAPIV3.Document
): ParsedOperation {
  const { method, path, operation } = op;

  // Generate method name
  const methodName = generateMethodName(operation, method, path);

  // Extract path parameters
  const pathParams = extractPathParameters(path, operation);

  // Extract query parameters
  const queryParams = extractQueryParameters(operation);

  // Extract request body
  const requestBody = extractRequestBody(operation);

  // Extract responses
  const responses = extractResponses(operation);

  return {
    method,
    path,
    methodName,
    pathParams,
    queryParams,
    requestBody,
    responses,
    operation,
  };
}

/**
 * Get the group name for an operation
 */
function getGroupName(
  op: { method: string; path: string; operation: OpenAPIV3.OperationObject },
  strategy: 'tags' | 'path'
): string {
  if (strategy === 'tags' && op.operation.tags && op.operation.tags.length > 0) {
    // Use the first tag
    return toCamelCase(op.operation.tags[0]);
  }

  // Fallback to path-based grouping
  const pathSegments = op.path.split('/').filter(segment => segment && !segment.startsWith('{'));
  if (pathSegments.length > 0) {
    return toCamelCase(pathSegments[0]);
  }

  // Ultimate fallback
  return 'default';
}

/**
 * Generate a method name from operation details
 */
function generateMethodName(
  operation: OpenAPIV3.OperationObject,
  method: string,
  path: string
): string {
  // Use operationId if available
  if (operation.operationId) {
    return toCamelCase(operation.operationId);
  }

  // Generate from method and path
  const pathSegments = path
    .split('/')
    .filter(segment => segment && !segment.startsWith('{'))
    .map(segment => toPascalCase(segment));

  const baseName = pathSegments.join('');
  const methodPrefix = method.toLowerCase();

  // Handle common patterns
  let methodName: string;

  if (method === 'GET' && pathSegments.length === 1) {
    methodName = `list${baseName}`;
  } else if (method === 'GET' && pathSegments.length > 1) {
    methodName = `get${baseName}`;
  } else if (method === 'POST') {
    methodName = `create${baseName}`;
  } else if (method === 'PUT') {
    methodName = `update${baseName}`;
  } else if (method === 'PATCH') {
    methodName = `patch${baseName}`;
  } else if (method === 'DELETE') {
    methodName = `delete${baseName}`;
  } else {
    methodName = `${methodPrefix}${baseName}`;
  }

  // Ensure the final method name is in camelCase
  // Convert PascalCase to camelCase (e.g., "ListUsers" -> "listUsers")
  return methodName.charAt(0).toLowerCase() + methodName.slice(1);
}

/**
 * Extract path parameters from a path string
 */
function extractPathParameters(
  path: string,
  operation: OpenAPIV3.OperationObject
): Array<{ name: string; type: string; required: boolean }> {
  const params: Array<{ name: string; type: string; required: boolean }> = [];
  const pathParams =
    operation.parameters?.filter(
      (param): param is OpenAPIV3.ParameterObject => !('$ref' in param) && param.in === 'path'
    ) || [];

  // Extract parameter names from path
  const pathParamNames = path.match(/\{([^}]+)\}/g) || [];

  for (const paramName of pathParamNames) {
    const cleanName = paramName.slice(1, -1); // Remove { }
    const param = pathParams.find(p => p.name === cleanName);

    params.push({
      name: cleanName,
      type: getParameterType(param),
      required: param?.required ?? true,
    });
  }

  return params;
}

/**
 * Extract query parameters from an operation
 */
function extractQueryParameters(
  operation: OpenAPIV3.OperationObject
): Array<{ name: string; type: string; required: boolean; schema?: OpenAPIV3.SchemaObject }> {
  const queryParams =
    operation.parameters?.filter(
      (param): param is OpenAPIV3.ParameterObject => !('$ref' in param) && param.in === 'query'
    ) || [];

  return queryParams.map(param => {
    const result: {
      name: string;
      type: string;
      required: boolean;
      schema?: OpenAPIV3.SchemaObject;
    } = {
      name: param.name,
      type: getParameterType(param),
      required: param.required ?? false,
    };

    if (param.schema && !('$ref' in param.schema)) {
      result.schema = param.schema;
    }

    return result;
  });
}

/**
 * Extract request body from an operation
 */
function extractRequestBody(
  operation: OpenAPIV3.OperationObject
): { contentType: string; schema: OpenAPIV3.SchemaObject } | undefined {
  if (!operation.requestBody || '$ref' in operation.requestBody) {
    return undefined;
  }

  const content = operation.requestBody.content;
  const contentType = Object.keys(content)[0];

  if (!contentType || !content[contentType]?.schema) {
    return undefined;
  }

  const schema = content[contentType].schema;

  // Handle $ref schemas by returning the reference
  if ('$ref' in schema) {
    return {
      contentType,
      schema: { $ref: schema.$ref } as OpenAPIV3.SchemaObject,
    };
  }

  return {
    contentType,
    schema,
  };
}

/**
 * Extract response schemas from an operation
 */
function extractResponses(
  operation: OpenAPIV3.OperationObject
): Array<{ statusCode: string; contentType: string; schema?: OpenAPIV3.SchemaObject }> {
  const responses: Array<{
    statusCode: string;
    contentType: string;
    schema?: OpenAPIV3.SchemaObject;
  }> = [];

  for (const [statusCode, response] of Object.entries(operation.responses || {})) {
    if ('$ref' in response) continue;

    const content = response.content;
    if (!content) continue;

    for (const [contentType, mediaType] of Object.entries(content)) {
      if (mediaType.schema) {
        responses.push({
          statusCode,
          contentType,
          schema: mediaType.schema as OpenAPIV3.SchemaObject,
        });
      }
    }
  }

  return responses;
}

/**
 * Get TypeScript type for a parameter
 */
function getParameterType(param?: OpenAPIV3.ParameterObject): string {
  if (!param?.schema || '$ref' in param.schema) {
    return 'string'; // Default fallback
  }

  const schema = param.schema;

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'string[]'; // Query params are typically strings
    default:
      return 'string';
  }
}
