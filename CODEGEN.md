# OpenAPI SDK Code Generator

> **⚠️ Beta Feature**: The code generator is currently in beta. While it's fully functional, the API may change in future versions based on user feedback.

The OpenAPI SDK Code Generator is a powerful tool that automatically generates strongly-typed SDK clients from OpenAPI 3.0+ and Swagger 2.0 specifications. It creates TypeScript clients that extend the `HttpClient` class with organized route groups and comprehensive TypeScript types.

## Features

- 🚀 **Automatic Code Generation**: Generate complete SDK clients from OpenAPI specs
- 🔒 **Strongly Typed**: Full TypeScript support with types from `openapi-typescript`
- 📦 **Modular Structure**: Organized route groups and centralized type definitions
- 🛡️ **Type Safety**: Runtime-free TypeScript types for all API operations
- 🎯 **Smart Grouping**: Group endpoints by OpenAPI tags or path segments
- 🔧 **Customizable**: Configurable client names and grouping strategies
- 🌲 **Tree-Shakable**: Only import what you need

## Installation

The code generator is available as a separate export from the http-client package. Install the required peer dependencies:

```bash
npm install @reggieofarrell/http-client openapi-typescript
```

For codegen support, install all dependencies as dev dependencies:

```bash
# Required for all codegen
npm install --save-dev openapi-typescript

# Optional - install only if needed
npm install --save-dev swagger2openapi          # For Swagger 2.0 support
npm install --save-dev yaml                      # For YAML specification files
npm install --save-dev @apidevtools/json-schema-ref-parser  # For multi-file specs
```

**Note**:
- All codegen dependencies are dev dependencies since codegen happens during development/CI
- `openapi-typescript` is required for type generation
- `swagger2openapi` is optional and only needed for Swagger 2.0 specifications
- `yaml` is optional and only needed for YAML specification files (single or multi-file)
- `@apidevtools/json-schema-ref-parser` is optional and only needed for multi-file specifications

## Quick Start

```typescript
import { generateClient } from '@reggieofarrell/http-client/codegen';

// Generate a client from an OpenAPI specification
await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  clientName: 'MyApiClient',
});
```

## Usage

### Basic Usage

```typescript
import { generateClient } from '@reggieofarrell/http-client/codegen';

await generateClient({
  openApiSpec: './openapi.json',        // Path to OpenAPI/Swagger spec or parsed object
  outputDir: './src/api-client',        // Output directory for generated code
  clientName: 'MyApiClient',            // Optional: custom client name
});
```

### Advanced Configuration

```typescript
await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  clientName: 'MyApiClient',
  groupingStrategy: 'tags',             // 'tags' (default) or 'path'
  includeDeprecated: false,             // Skip deprecated endpoints (default: false)
});
```

## Generated Code Structure

The generator creates a well-organized file structure:

```
src/api-client/
├── client.ts                 # Main client class
├── index.ts                  # Main exports
├── types.d.ts                # TypeScript types from openapi-typescript
├── routes/
│   ├── users.route.ts        # Users route group
│   ├── documents.route.ts    # Documents route group
│   └── index.ts              # Route exports
└── types/
    └── errors.ts             # Error response types (if custom error schemas exist)
```

## Generated Client Example

### Using the Generated Client

```typescript
import { MyApiClient } from './api-client';

// The generated client already has a default baseURL configured
const client = new MyApiClient({
  // All standard HttpClient options are available
  retryConfig: {
    retries: 3,
    backoff: 'exponential',
  },
});

// Or override the default baseURL if needed
const customClient = new MyApiClient({
  baseURL: 'https://custom-api.example.com',
});

// Fully typed methods with intellisense!
const users = await client.users.listUsers();
const user = await client.users.getUser({ id: '123' });
const newUser = await client.users.createUser({
  name: 'John Doe',
  email: 'john@example.com'
});

// Query parameters are typed too
const documents = await client.documents.listDocuments({
  limit: 10,
  offset: 0
});
```

### Generated Route Group Example

```typescript
// Generated routes/users.route.ts
import { HttpClient } from '@reggieofarrell/http-client';
import type { components } from '../types';

type User = components['schemas']['User'];
type CreateUserRequest = components['schemas']['CreateUserRequest'];

export class UsersRouteGroup {
  constructor(private client: HttpClient) {}

  async listUsers(): Promise<User[]> {
    return (await this.client.get<User[]>('/users')).data;
  }

  async getUser(pathParams: { id: string }): Promise<User> {
    return (await this.client.get<User>(`/users/:id`, { pathParams: pathParams })).data;
  }

  async createUser(body: CreateUserRequest): Promise<User> {
    return (await this.client.post<User>('/users', { data: body })).data;
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `openApiSpec` | `string \| object` | Required | OpenAPI 3.0+ or Swagger 2.0 specification (file path or parsed object) |
| `outputDir` | `string` | Required | Directory for generated files |
| `clientName` | `string` | Auto-generated | Name of the generated client class (from spec title or 'ApiClient') |
| `groupingStrategy` | `'tags' \| 'path'` | `'tags'` | How to group endpoints into route groups |
| `includeDeprecated` | `boolean` | `false` | Include deprecated endpoints in generated code |
| `errorMessagePath` | `string` | Auto-detected | Path to extract error messages from API responses (dot notation) |
| `autoDetectErrorPath` | `boolean` | `true` | Whether to auto-detect error message path from OpenAPI spec |

## Route Grouping Strategies

### By Tags (Default)

Endpoints are grouped by their OpenAPI tags:

```yaml
paths:
  /users:
    get:
      operationId: listUsers
      tags: [users]
  /users/{id}:
    get:
      operationId: getUser
      tags: [users]
  /documents:
    get:
      operationId: listDocuments
      tags: [documents]
```

**Generated structure:**
```typescript
client.users.listUsers()
client.users.getUser({ id: '123' })
client.documents.listDocuments()
```

### By Path

Endpoints are grouped by the first path segment:

```yaml
paths:
  /users:
    get:
  /users/{id}:
    get:
  /documents:
    get:
```

**Generated structure:**
```typescript
client.users.listUsers()
client.users.getUser({ id: '123' })
client.documents.listDocuments()
```

**Tip**: Use tags for better control over grouping. The generator will use the first tag of each operation.

## Type Generation

The generator leverages `openapi-typescript` to create runtime-free TypeScript types directly from your OpenAPI schemas:

```typescript
// Generated types.d.ts
export interface components {
  schemas: {
    User: {
      id: string;
      name: string;
      email: string;
      age?: number;
      createdAt: string;
    };
    CreateUserRequest: {
      name: string;
      email: string;
      age?: number;
    };
  };
}
```

**Benefits:**
- **Runtime-free**: No validation overhead in production
- **Full TypeScript support**: Leverage the TypeScript compiler for type checking
- **Intellisense**: Get autocomplete for all request/response types
- **Type aliases**: Clean, readable type names in generated route files

## Method Naming

The generator creates camelCase method names from your OpenAPI operations:

### From operationId (Recommended)

```yaml
paths:
  /users/{id}:
    get:
      operationId: getUserById
```

Generates: `client.users.getUserById({ id: '123' })`

### Auto-generated

If no `operationId` is provided, the generator creates method names from the HTTP method and path:

- `GET /users` → `listUsers()`
- `GET /users/{id}` → `getUser({ id })`
- `POST /users` → `createUser(body)`
- `PUT /users/{id}` → `updateUser({ id }, body)`
- `PATCH /users/{id}` → `patchUser({ id }, body)`
- `DELETE /users/{id}` → `deleteUser({ id })`

## Error Handling

Generated clients inherit all error handling from `HttpClient`. All errors conform to the standard `HttpError`, `NetworkError`, `TimeoutError`, or `SerializationError` types.

### Basic Error Handling

```typescript
import { HttpError, NetworkError, TimeoutError } from '@reggieofarrell/http-client';

try {
  const user = await client.users.getUser({ id: '123' });
} catch (error) {
  if (error instanceof HttpError) {
    console.error(`HTTP ${error.status}: ${error.message}`);
    console.error('Response:', error.response.data);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  }
}
```

### Type-Safe Error Response Data

If your OpenAPI spec defines custom error response schemas, the generator creates TypeScript types for them. Error interfaces are named based on their schema names (e.g., `error_400` → `Error400`, `orders.patch-400` → `OrdersPatch400`). You can use these types to safely access error response data:

```typescript
import { HttpError } from '@reggieofarrell/http-client';
import { Error400, Error500 } from './api-client/types/errors';

try {
  const user = await client.users.getUser({ id: '123' });
} catch (error) {
  if (error instanceof HttpError) {
    // Type-cast error.response.data for type safety
    if (error.status === 400) {
      const errorData = error.response.data as Error400;
      console.error(`Error: ${errorData.name}`);
      if (errorData.details) {
        console.error(`Details: ${errorData.details}`);
      }
    } else if (error.status === 500) {
      const errorData = error.response.data as Error500;
      console.error(`Server error: ${errorData.name}`);
    }
  }
}
```

**Error Interface Naming:**
- Schema names from OpenAPI specs are converted to PascalCase interface names
- `error_400` → `Error400`
- `error_500` → `Error500`
- `orders.patch-400` → `OrdersPatch400`
- `error_422` → `Error422`

**Benefits:**
- **Single error type to handle**: Only catch `HttpError` for API errors
- **Standard conformance**: All errors follow the same pattern
- **Type safety**: Error response data is fully typed
- **No custom error classes**: Simpler mental model, easier to maintain

## Integration with Build Tools

### Package.json Scripts

```json
{
  "scripts": {
    "generate:api": "node --loader ts-node/esm scripts/generate-api.ts",
    "prebuild": "npm run generate:api",
    "build": "tsc"
  }
}
```

### Generation Script

```typescript
// scripts/generate-api.ts
import { generateClient } from '@reggieofarrell/http-client/codegen';

await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  clientName: 'MyApiClient',
});

console.log('✅ API client generated successfully!');
```

### CI/CD Integration

```yaml
# GitHub Actions example
name: Generate API Client

on:
  push:
    paths:
      - 'openapi.json'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Generate API Client
        run: npm run generate:api

      - name: Commit generated code
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add src/api-client
          git commit -m "chore: regenerate API client" || echo "No changes"
          git push
```

## Advanced Features

### Custom Naming

The generator automatically converts OpenAPI names to valid TypeScript identifiers:

- `user-profile` → `userProfile`
- `get_user_by_id` → `getUserById`
- `APIResponse` → `apiResponse`
- `User-ID` → `userId`

### Handling Reserved Keywords

If a parameter name conflicts with a TypeScript reserved keyword, the generator automatically appends `Param`:

- `type` → `typeParam`
- `class` → `classParam`
- `return` → `returnParam`

### Path Parameters

Path parameters are automatically extracted and included in method signatures. The generator uses `pathParams` as the parameter name for clarity, and converts OpenAPI's `{paramName}` format to HttpClient's `:paramName` format. HttpClient automatically handles path parameter substitution:

```yaml
/users/{userId}/posts/{postId}:
  get:
    parameters:
      - name: userId
        in: path
        schema:
          type: string
      - name: postId
        in: path
        schema:
          type: string
```

Generates:
```typescript
async getPost(pathParams: { userId: string; postId: string }): Promise<Post> {
  return (await this.client.get<Post>(
    `/users/:userId/posts/:postId`,
    { pathParams: pathParams }
  )).data;
}
```

**Notes:**
- Path parameters use the `pathParams` parameter name (not `params`) for clarity
- URLs use `:paramName` format instead of `{paramName}` format
- HttpClient automatically substitutes path parameters - no manual URL construction needed
- All path parameter values are automatically URL-encoded for safety

### Query Parameters

Query parameters are automatically included in requests:

```yaml
/users:
  get:
    parameters:
      - name: limit
        in: query
        schema:
          type: integer
      - name: offset
        in: query
        schema:
          type: integer
```

Generates:
```typescript
async listUsers(query?: { limit?: number; offset?: number }): Promise<User[]> {
  return (await this.client.get<User[]>('/users', {
    query: query
  })).data;
}
```

## Troubleshooting

### Common Issues

**Q: `Cannot find module 'openapi-typescript'`**

A: Install the peer dependency:
```bash
npm install openapi-typescript
```

**Q: Generated code has linting errors**

A: Run your formatter on the generated code:
```json
{
  "scripts": {
    "generate:api": "node scripts/generate.js && npm run format -- src/api-client"
  }
}
```

**Q: Missing route groups**

A: Check that your OpenAPI spec has proper tags or path structure. Try using `groupingStrategy: 'path'` for path-based grouping.

**Q: Type errors in generated code**

A: Ensure your OpenAPI spec has valid schema definitions. Run `openapi-typescript` directly to debug:
```bash
npx openapi-typescript ./openapi.json -o ./test-types.d.ts
```

**Q: Methods have incorrect names**

A: Add `operationId` to your OpenAPI operations for explicit control over method names.

### Debugging

Enable console logging to see what's being generated:

The generator logs each file as it's created:
```
📄 Generated types: ./src/api-client/types.d.ts
📄 Generated client: ./src/api-client/client.ts
📄 Generated route group: ./src/api-client/routes/users.route.ts
📄 Generated route group: ./src/api-client/routes/documents.route.ts
📄 Generated main index: ./src/api-client/index.ts
📄 Generated routes index: ./src/api-client/routes/index.ts
✅ Generated SDK client in ./src/api-client
```

## Best Practices

1. **Use operationId**: Always define `operationId` in your OpenAPI spec for predictable method names
2. **Use tags for grouping**: Organize endpoints with tags for logical route groups
3. **Version your spec**: Keep your OpenAPI spec in version control alongside generated code
4. **Regenerate regularly**: Run the generator as part of your build process
5. **Review generated code**: Check generated code into version control for easier debugging
6. **Use TypeScript strict mode**: Get the full benefit of type safety

## Examples

### Complete Example with Retry Logic

```typescript
import { MyApiClient } from './api-client';
import { HttpError } from '@reggieofarrell/http-client';

const client = new MyApiClient({
  retryConfig: {
    retries: 3,
    backoff: 'exponential',
    delayFactor: 1000,
    enableRetry: (config, error) => {
      // Retry on network errors and 5xx
      return error.code === 'ECONNREFUSED' ||
             (error.response?.status || 0) >= 500;
    },
  },
});

try {
  const user = await client.users.getUser({ id: '123' });
  console.log('User:', user);
} catch (error) {
  if (error instanceof HttpError) {
    console.error(`API Error ${error.status}:`, error.response.data);
  }
}
```

### Using with React Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { myApiClient } from './api-client';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => myApiClient.users.getUser({ id: userId }),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{user.name}</div>;
}
```

## Error Message Path Configuration

The code generator can automatically configure error message extraction for your generated client, making it easier to handle API errors consistently.

### Auto-Detection (Default)

By default, the generator analyzes your OpenAPI spec's error response schemas to detect the most common error message path:

```typescript
// Auto-detection enabled (default)
await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  // Will auto-detect error message path from your spec
});
```

The generator looks for common error message fields like `message`, `error`, `detail`, etc. in 4xx and 5xx response schemas and uses the most frequently occurring path.

### Manual Configuration

You can specify a custom error message path:

```typescript
// Manual error message path
await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  errorMessagePath: 'data.error.detail', // Custom path
});
```

### Disable Auto-Detection

If you prefer to handle error message paths manually:

```typescript
// Disable auto-detection
await generateClient({
  openApiSpec: './openapi.json',
  outputDir: './src/api-client',
  autoDetectErrorPath: false,
});
```

### Generated Client Usage

The generated client will include the configured error message path in its constructor:

```typescript
// Generated client.ts
export class MyApiClient extends HttpClient {
  constructor(config?: HttpClientOptions) {
    super({
      baseURL: 'https://api.example.com',
      errorMessagePath: 'data.error.message', // Auto-detected or manual
      ...config
    });
    // ... route group initializations
  }
}
```

### Override at Runtime

You can still override the error message path when instantiating the client:

```typescript
// Override the generated default
const client = new MyApiClient({
  errorMessagePath: 'data.custom.error', // Override
});

// Or use per-request overrides for different endpoints
await client.get('/special-endpoint', {
  errorMessagePath: 'data.errors.0.message'
});
```

### Common API Patterns

The generator recognizes these common error message patterns:

- **GitHub API**: `data.message`
- **Stripe API**: `data.error.message`
- **Custom APIs**: `data.errors.0.detail`
- **Nested errors**: `data.error.details.message`

## Supported Specifications

The code generator supports both modern and legacy API specification formats:

### OpenAPI 3.0+ (Recommended)
- Full support for OpenAPI 3.0, 3.1, and future versions
- All features available including advanced schema types, security schemes, and more
- No additional dependencies required

### Swagger 2.0 (Legacy Support)
- Automatic detection and conversion to OpenAPI 3.0+ format
- Requires `swagger2openapi` peer dependency
- All features available after conversion
- Backward compatibility for older API specifications

### Automatic Detection
The generator automatically detects the specification format:
- **OpenAPI 3.0+**: Specs with `"openapi": "3.0.x"` field
- **Swagger 2.0**: Specs with `"swagger": "2.0"` field

No manual configuration needed - just provide your spec file and the generator handles the rest!

## Multi-File Specifications

The code generator automatically resolves external `$ref` references in your API specifications, making it easy to work with large APIs that are split across multiple files.

### Supported Reference Types

The generator supports various types of external references:

- **Local files (JSON)**: `"$ref": "./schemas/user.json"`
- **Local files (YAML)**: `"$ref": "./schemas/user.yaml"`
- **Relative paths**: `"$ref": "../common/error.yaml"`
- **Nested references**: `"$ref": "./schemas/user.json#/User"`
- **HTTP/HTTPS URLs**: `"$ref": "https://api.example.com/schemas/common.json"`

### Example Directory Structure

```
specs/
├── openapi.yaml          # Main spec with $refs
├── paths/
│   ├── users.yaml        # User endpoints
│   ├── products.yaml     # Product endpoints
│   └── orders.yaml       # Order endpoints
├── schemas/
│   ├── user.yaml         # User schemas
│   ├── product.yaml      # Product schemas
│   └── common.yaml       # Shared schemas
└── components/
    ├── security.yaml     # Security definitions
    └── responses.yaml    # Common responses
```

### Example: Main Spec File

```yaml
# specs/openapi.yaml
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
paths:
  /users:
    $ref: './paths/users.yaml'
  /products:
    $ref: './paths/products.yaml'
components:
  schemas:
    User:
      $ref: './schemas/user.yaml#/User'
    Product:
      $ref: './schemas/product.yaml#/Product'
```

### Example: Referenced Schema File

```yaml
# specs/schemas/user.yaml
User:
  type: object
  properties:
    id:
      type: string
    name:
      type: string
    email:
      type: string
      format: email
```

### Using Multi-File Specs

No additional configuration needed - just provide the main spec file path:

```typescript
await generateClient({
  openApiSpec: './specs/openapi.yaml',  // References other files automatically resolved
  outputDir: './src/api-client',
  clientName: 'MyApiClient',
});
```

### Requirements

For YAML specification support, install:

```bash
npm install --save-dev yaml
```

For multi-file specification support, install:

```bash
npm install --save-dev @apidevtools/json-schema-ref-parser
```

**Note**:
- All codegen dependencies are dev dependencies since codegen happens during development/CI
- `openapi-typescript` is required for all codegen (install as dev dependency)
- Single-file JSON specifications work with just `openapi-typescript`
- YAML specifications (single or multi-file) require the `yaml` package
- Multi-file specifications (JSON or YAML) require the `@apidevtools/json-schema-ref-parser` package

### Error Handling

The generator provides helpful error messages when references can't be resolved:

- **File not found**: Clear message indicating which file is missing
- **Network errors**: Timeout and connection error details for HTTP/HTTPS refs
- **Circular references**: Detection and graceful handling of circular dependencies

### Circular References

The generator handles circular references gracefully by ignoring them during dereferencing. This allows you to have schemas that reference each other without causing errors:

```yaml
# User references Organization
User:
  type: object
  properties:
    organization:
      $ref: '#/components/schemas/Organization'

# Organization references User
Organization:
  type: object
  properties:
    owner:
      $ref: '#/components/schemas/User'
```

## Contributing

The code generator is part of the http-client package. To contribute:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

See the main README for development setup instructions.

## License

This project is licensed under the 0BSD License - see the [license.txt](license.txt) file for details.
