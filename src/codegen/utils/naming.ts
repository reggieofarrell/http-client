/**
 * Naming Utilities
 *
 * This module provides utilities for converting OpenAPI names and paths
 * to valid TypeScript identifiers following naming conventions.
 */

/**
 * Convert a string to camelCase
 *
 * @param str - String to convert
 * @returns camelCase string
 *
 * @example
 * ```typescript
 * toCamelCase('user-profile') // 'userProfile'
 * toCamelCase('get_user_by_id') // 'getUserById'
 * ```
 */
export function toCamelCase(str: string): string {
  // Handle empty or single character strings
  if (!str || str.length === 0) return str;

  // If already in camelCase (starts with lowercase, has uppercase letters), preserve it
  if (/^[a-z][a-zA-Z0-9]*$/.test(str)) {
    return str;
  }

  // Split on delimiters or camelCase boundaries
  const words = str
    .split(/[-_\s]+/)
    .flatMap(word => {
      // Split camelCase/PascalCase words
      if (/^[a-zA-Z]+$/.test(word)) {
        return word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      }
      return word;
    })
    .filter(word => word.length > 0);

  return words
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Convert a string to PascalCase
 *
 * @param str - String to convert
 * @returns PascalCase string
 *
 * @example
 * ```typescript
 * toPascalCase('user-profile') // 'UserProfile'
 * toPascalCase('get_user_by_id') // 'GetUserById'
 * ```
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert a string to kebab-case
 *
 * @param str - String to convert
 * @returns kebab-case string
 *
 * @example
 * ```typescript
 * toKebabCase('UserProfile') // 'user-profile'
 * toKebabCase('getUserById') // 'get-user-by-id'
 * ```
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert a string to snake_case
 *
 * @param str - String to convert
 * @returns snake_case string
 *
 * @example
 * ```typescript
 * toSnakeCase('UserProfile') // 'user_profile'
 * toSnakeCase('getUserById') // 'get_user_by_id'
 * ```
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/**
 * Convert a path parameter to a valid TypeScript identifier
 *
 * @param param - Path parameter name
 * @returns Valid TypeScript identifier
 *
 * @example
 * ```typescript
 * toValidIdentifier('user-id') // 'userId'
 * toValidIdentifier('123invalid') // '_123invalid'
 * ```
 */
export function toValidIdentifier(param: string): string {
  // Convert to camelCase first
  let identifier = toCamelCase(param);

  // Handle reserved keywords
  const reservedKeywords = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'let',
    'static',
    'enum',
    'implements',
    'interface',
    'package',
    'private',
    'protected',
    'public',
    'abstract',
    'as',
    'asserts',
    'any',
    'boolean',
    'constructor',
    'declare',
    'get',
    'is',
    'keyof',
    'module',
    'namespace',
    'never',
    'readonly',
    'set',
    'symbol',
    'type',
    'undefined',
    'unique',
    'unknown',
    'from',
    'global',
  ]);

  if (reservedKeywords.has(identifier)) {
    identifier = `${identifier}Param`;
  }

  // Handle identifiers starting with numbers
  if (/^[0-9]/.test(identifier)) {
    identifier = `_${identifier}`;
  }

  // Ensure it's a valid identifier
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(identifier)) {
    identifier = identifier.replace(/[^a-zA-Z0-9_$]/g, '');
    if (!/^[a-zA-Z_$]/.test(identifier)) {
      identifier = `_${identifier}`;
    }
  }

  return identifier;
}

/**
 * Convert an OpenAPI path to a method name
 *
 * @param method - HTTP method
 * @param path - API path
 * @returns Generated method name
 *
 * @example
 * ```typescript
 * pathToMethodName('GET', '/users/{id}') // 'getUser'
 * pathToMethodName('POST', '/users') // 'createUser'
 * pathToMethodName('PUT', '/users/{id}') // 'updateUser'
 * ```
 */
export function pathToMethodName(method: string, path: string): string {
  const pathSegments = path
    .split('/')
    .filter(segment => segment && !segment.startsWith('{'))
    .map(segment => toPascalCase(segment));

  const resourceName = pathSegments.join('');
  const methodLower = method.toLowerCase();

  // Handle common REST patterns
  if (methodLower === 'get' && path.includes('{')) {
    return `get${resourceName}`;
  }

  if (methodLower === 'get' && !path.includes('{')) {
    return `list${resourceName}`;
  }

  if (methodLower === 'post') {
    return `create${resourceName}`;
  }

  if (methodLower === 'put') {
    return `update${resourceName}`;
  }

  if (methodLower === 'patch') {
    return `patch${resourceName}`;
  }

  if (methodLower === 'delete') {
    return `delete${resourceName}`;
  }

  // Fallback
  return `${methodLower}${resourceName}`;
}

/**
 * Generate a class name from a group name
 *
 * @param groupName - Group name (e.g., 'users', 'user-profiles')
 * @returns Class name (e.g., 'UsersRouteGroup', 'UserProfilesRouteGroup')
 *
 * @example
 * ```typescript
 * toClassName('users') // 'UsersRouteGroup'
 * toClassName('user-profiles') // 'UserProfilesRouteGroup'
 * ```
 */
export function toClassName(groupName: string): string {
  return `${toPascalCase(groupName)}RouteGroup`;
}

/**
 * Generate a type name from a schema name
 *
 * @param schemaName - Schema name from OpenAPI
 * @returns Type name for TypeScript
 *
 * @example
 * ```typescript
 * toTypeName('user-profile') // 'UserProfile'
 * toTypeName('APIResponse') // 'APIResponse'
 * ```
 */
export function toTypeName(schemaName: string): string {
  return toPascalCase(schemaName);
}

/**
 * Generate a file name from a name
 *
 * @param name - Name to convert
 * @param suffix - File suffix (e.g., '.route', '.schema')
 * @returns File name
 *
 * @example
 * ```typescript
 * toFileName('user-profiles', '.route') // 'user-profiles.route'
 * toFileName('UserProfiles', '.schema') // 'user-profiles.schema'
 * ```
 */
export function toFileName(name: string, suffix: string = ''): string {
  return `${toKebabCase(name)}${suffix}`;
}

/**
 * Check if a string is a valid TypeScript identifier
 *
 * @param str - String to check
 * @returns True if valid identifier
 */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Sanitize a string to make it a valid TypeScript identifier
 *
 * @param str - String to sanitize
 * @returns Sanitized identifier
 */
export function sanitizeIdentifier(str: string): string {
  // Remove or replace invalid characters
  let sanitized = str.replace(/[^a-zA-Z0-9_$]/g, '');

  // Ensure it starts with a valid character
  if (!/^[a-zA-Z_$]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // Handle empty string
  if (!sanitized) {
    sanitized = 'unknown';
  }

  return sanitized;
}
