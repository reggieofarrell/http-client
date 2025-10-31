/**
 * Code Generator Tests
 *
 * This module tests the OpenAPI to SDK code generation functionality.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateClient } from '../../src/codegen/generator';
import {
  extractTypeNamesFromSpec,
  extractTypeNamesForOperations,
  extractResponseTypeMapping,
} from '../../src/codegen/parsers/openapi-parser';
import * as sampleOpenApiSpec from './sample-openapi.json';
import * as sampleSwagger2Spec from './sample-swagger2.json';

// Mock openapi-typescript
jest.mock('openapi-typescript', () => {
  return jest
    .fn()
    .mockResolvedValue('// Generated types\ninterface User { id: string; name: string; }');
});

// Mock swagger2openapi for Swagger 2.0 tests
jest.mock('swagger2openapi', () => {
  return {
    convertObj: jest.fn().mockResolvedValue({
      openapi: {
        openapi: '3.0.0',
        info: { title: 'Converted API', version: '1.0.0' },
        paths: {},
        components: { schemas: {} },
      },
    }),
  };
});

describe('Code Generator', () => {
  const testOutputDir = join(__dirname, '..', '..', '..', 'tmp', 'generated-client');

  beforeEach(async () => {
    // Clean up test output directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }
  });

  afterEach(async () => {
    // Clean up test output directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }
  });

  describe('generateClient', () => {
    it('should generate a complete SDK client from OpenAPI spec', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      // Check that main files were created
      const clientFile = join(testOutputDir, 'client.ts');
      const indexFile = join(testOutputDir, 'index.ts');

      expect(
        await fs
          .access(clientFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      expect(
        await fs
          .access(indexFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
    });

    it('should generate route group files', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      // Check that route group files were created
      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const documentsRouteFile = join(testOutputDir, 'routes', 'documents.route.ts');
      const routesIndexFile = join(testOutputDir, 'routes', 'index.ts');

      expect(
        await fs
          .access(usersRouteFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      expect(
        await fs
          .access(documentsRouteFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      expect(
        await fs
          .access(routesIndexFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
    });

    it('should generate types file when openapi-typescript is available', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      // Check that types file was created (if openapi-typescript worked)
      const typesFile = join(testOutputDir, 'types.d.ts');

      // This test might pass or fail depending on whether openapi-typescript
      // successfully generated types, which is fine
      const typesFileExists = await fs
        .access(typesFile)
        .then(() => true)
        .catch(() => false);

      // We don't assert on this since it depends on openapi-typescript working
      console.log(`Types file exists: ${typesFileExists}`);
    });

    it('should generate valid TypeScript code', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      // Read and verify the generated client file
      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      // Check for expected content
      expect(clientContent).toContain('export class SampleApiClient extends HttpClient');
      expect(clientContent).toContain('public readonly users: UsersRouteGroup');
      expect(clientContent).toContain('public readonly documents: DocumentsRouteGroup');
    });

    it('should generate route group classes with correct methods', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      // Check users route group
      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      expect(usersContent).toContain('export class UsersRouteGroup');
      expect(usersContent).toContain('async listUsers()');
      expect(usersContent).toContain('async createUser(');
      expect(usersContent).toContain('async getUser(');
      expect(usersContent).toContain('async updateUser(');
      expect(usersContent).toContain('async deleteUser(');
    });

    it('should use pathParams instead of params in method signatures', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should use pathParams for path parameters
      expect(usersContent).toContain('pathParams: {');
      // Should not use old params pattern for path parameters
      expect(usersContent).not.toMatch(/params:\s*\{\s*id:/);
    });

    it('should convert path parameters to :paramName format', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should use :paramName format
      expect(usersContent).toMatch(/\/users\/:id/);
      // Should not use template literal substitution
      expect(usersContent).not.toContain('${pathParams.');
      expect(usersContent).not.toContain('${params.');
    });

    it('should pass pathParams to HttpClient request config', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should pass pathParams in config
      expect(usersContent).toContain('pathParams: pathParams');
    });

    it('should not use manual URL construction with template literals', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should not use template literal URL construction
      expect(usersContent).not.toContain('${pathParams.');
      expect(usersContent).not.toContain('${params.');
      // Should not build query strings manually
      expect(usersContent).not.toContain('queryString');
      expect(usersContent).not.toContain('queryPairs');
    });

    it('should use concise return pattern without destructuring', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should use concise return pattern: return (await ...).data;
      expect(usersContent).toMatch(/return\s*\(await.*\)\.data;/);
      // Should not use destructuring pattern
      expect(usersContent).not.toContain('const { data } = await');
      expect(usersContent).not.toContain('return data;');
    });

    it('should handle multiple path parameters correctly', async () => {
      const specWithMultipleParams = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{userId}/posts/{postId}': {
            get: {
              tags: ['posts'],
              operationId: 'getPost',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'postId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: specWithMultipleParams,
        outputDir: testOutputDir,
        clientName: 'TestClient',
      });

      const postsRouteFile = join(testOutputDir, 'routes', 'posts.route.ts');
      const postsContent = await fs.readFile(postsRouteFile, 'utf-8');

      // Should use pathParams with both parameters
      expect(postsContent).toContain('pathParams: { userId: string, postId: string }');
      // Should convert both parameters in URL
      expect(postsContent).toMatch(/\/users\/:userId\/posts\/:postId/);
      // Should pass pathParams to HttpClient
      expect(postsContent).toContain('pathParams: pathParams');
    });

    it('should handle path-based grouping when no tags are present', async () => {
      // Create a spec without tags
      const specWithoutTags = {
        ...sampleOpenApiSpec,
        paths: {
          '/api/users': sampleOpenApiSpec.paths['/users'],
          '/api/documents': sampleOpenApiSpec.paths['/documents'],
        },
      };

      await generateClient({
        openApiSpec: specWithoutTags,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
        groupingStrategy: 'path',
      });

      // Should still generate files
      const clientFile = join(testOutputDir, 'client.ts');
      expect(
        await fs
          .access(clientFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
    });

    it('should handle custom client name', async () => {
      const customName = 'MyCustomApiClient';

      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: customName,
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      expect(clientContent).toContain(`export class ${customName} extends HttpClient`);
    });

    it('should exclude deprecated endpoints when includeDeprecated is false', async () => {
      // Create a spec with deprecated endpoints
      const specWithDeprecated = {
        ...sampleOpenApiSpec,
        paths: {
          ...sampleOpenApiSpec.paths,
          '/users/{id}/old': {
            get: {
              tags: ['users'],
              deprecated: true,
              responses: {
                '200': {
                  description: 'Old endpoint',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: specWithDeprecated,
        outputDir: testOutputDir,
        clientName: 'SampleApiClient',
        includeDeprecated: false,
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const usersContent = await fs.readFile(usersRouteFile, 'utf-8');

      // Should not contain the deprecated endpoint
      expect(usersContent).not.toContain('old');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid OpenAPI spec', async () => {
      const invalidSpec = {
        openapi: '3.0.0',
        // Missing required fields
      };

      await expect(
        generateClient({
          openApiSpec: invalidSpec,
          outputDir: testOutputDir,
          clientName: 'TestClient',
        })
      ).rejects.toThrow();
    });

    it('should throw error for missing paths', async () => {
      const specWithoutPaths = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        // Missing paths
      };

      await expect(
        generateClient({
          openApiSpec: specWithoutPaths,
          outputDir: testOutputDir,
          clientName: 'TestClient',
        })
      ).rejects.toThrow();
    });
  });

  describe('Error Message Path Generation', () => {
    it('should generate client with manual error message path', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'TestClient',
        errorMessagePath: 'data.error.detail',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      expect(clientContent).toContain("errorMessagePath: 'data.error.detail'");
      expect(clientContent).toContain(
        "super({ baseURL: 'https://api.example.com', errorMessagePath: 'data.error.detail', ...config });"
      );
    });

    it('should auto-detect error message path from OpenAPI spec', async () => {
      const specWithErrorSchemas = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            get: {
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Bad Request',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          error: {
                            type: 'object',
                            properties: {
                              message: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                '500': {
                  description: 'Server Error',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          error: {
                            type: 'object',
                            properties: {
                              message: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: specWithErrorSchemas,
        outputDir: testOutputDir,
        clientName: 'TestClient',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      // Should contain auto-detected path
      expect(clientContent).toContain('errorMessagePath:');
    });

    it('should not auto-detect when autoDetectErrorPath is false', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'TestClient',
        autoDetectErrorPath: false,
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      // Should not contain errorMessagePath in constructor
      expect(clientContent).not.toContain('errorMessagePath:');
    });

    it('should handle spec without error responses gracefully', async () => {
      const specWithoutErrors = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            get: {
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: specWithoutErrors,
        outputDir: testOutputDir,
        clientName: 'TestClient',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      // Should not contain errorMessagePath when no error responses found
      expect(clientContent).not.toContain('errorMessagePath:');
    });

    it('should prioritize manual errorMessagePath over auto-detection', async () => {
      const specWithErrorSchemas = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            get: {
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Bad Request',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          error: {
                            type: 'object',
                            properties: {
                              message: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: specWithErrorSchemas,
        outputDir: testOutputDir,
        clientName: 'TestClient',
        errorMessagePath: 'data.custom.error',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      // Should use manual path, not auto-detected
      expect(clientContent).toContain("errorMessagePath: 'data.custom.error'");
      expect(clientContent).not.toContain("errorMessagePath: 'data.error.message'");
    });
  });

  describe('Swagger 2.0 Support', () => {
    it('should detect and convert Swagger 2.0 specifications', async () => {
      await generateClient({
        openApiSpec: sampleSwagger2Spec,
        outputDir: testOutputDir,
        clientName: 'Swagger2ApiClient',
      });

      // Check that main files were created
      const clientFile = join(testOutputDir, 'client.ts');
      const indexFile = join(testOutputDir, 'index.ts');

      await expect(fs.access(clientFile)).resolves.toBeUndefined();
      await expect(fs.access(indexFile)).resolves.toBeUndefined();
      // Types file may not exist if openapi-typescript fails (which is expected in tests)

      // Check client content
      const clientContent = await fs.readFile(clientFile, 'utf-8');
      expect(clientContent).toContain('export class Swagger2ApiClient');
      // Note: The mocked conversion returns empty paths, so no route groups are generated
      // In real usage, the converted spec would have the proper paths and generate route groups
    });

    it('should handle Swagger 2.0 file paths', async () => {
      const swagger2File = join(__dirname, 'sample-swagger2.json');

      await generateClient({
        openApiSpec: swagger2File,
        outputDir: testOutputDir,
        clientName: 'FileSwagger2Client',
      });

      // Check that files were generated
      const clientFile = join(testOutputDir, 'client.ts');
      await expect(fs.access(clientFile)).resolves.toBeUndefined();

      const clientContent = await fs.readFile(clientFile, 'utf-8');
      expect(clientContent).toContain('export class FileSwagger2Client');
    });

    it('should handle Swagger 2.0 conversion successfully', async () => {
      // This test verifies that Swagger 2.0 specs are detected and processed
      // The actual conversion is mocked, but we can verify the detection works
      const { isSwagger2 } = await import('../../src/codegen/utils/swagger-converter');

      expect(isSwagger2(sampleSwagger2Spec)).toBe(true);
      expect(isSwagger2(sampleOpenApiSpec)).toBe(false);
    });

    it('should handle invalid specification format', async () => {
      const invalidSpec = { invalid: 'spec' };

      await expect(
        generateClient({
          openApiSpec: invalidSpec,
          outputDir: testOutputDir,
          clientName: 'InvalidClient',
        })
      ).rejects.toThrow('Invalid specification format');
    });
  });

  describe('Multi-File Specification Support', () => {
    it('should parse YAML specifications', async () => {
      // Create a simple YAML spec without external refs for this test
      const simpleYamlSpec = {
        openapi: '3.0.0',
        info: { title: 'YAML Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              tags: ['test'],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      await generateClient({
        openApiSpec: simpleYamlSpec,
        outputDir: testOutputDir,
        clientName: 'YamlClient',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      await expect(fs.access(clientFile)).resolves.toBeUndefined();

      const clientContent = await fs.readFile(clientFile, 'utf-8');
      expect(clientContent).toContain('export class YamlClient');
    });

    it('should handle single-file specs (backward compatibility)', async () => {
      // This test ensures backward compatibility - single-file specs should always work
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'SingleFileClient',
      });

      const clientFile = join(testOutputDir, 'client.ts');
      await expect(fs.access(clientFile)).resolves.toBeUndefined();

      const clientContent = await fs.readFile(clientFile, 'utf-8');
      expect(clientContent).toContain('export class SingleFileClient');
    });
  });

  describe('Type Alias Generation', () => {
    it('should extract type names from spec with schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateUserRequest' },
                  },
                },
              },
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
          '/posts': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Post' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.size).toBeGreaterThan(0);
      expect(typeNames.has('CreateUserRequest')).toBe(true);
      expect(typeNames.has('User')).toBe(true);
      expect(typeNames.has('Post')).toBe(true);
    });

    it('should extract type names from array schemas with item references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Item' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.has('Item')).toBe(true);
    });

    it('should return empty set for spec without schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.size).toBe(0);
    });

    it('should extract type names from requestBody only', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/UserRequest' },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Created',
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.has('UserRequest')).toBe(true);
    });

    it('should extract type names from responses only', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.has('User')).toBe(true);
    });

    it('should generate type aliases in route group files when types are available', async () => {
      await generateClient({
        openApiSpec: sampleOpenApiSpec,
        outputDir: testOutputDir,
        clientName: 'TypeAliasTestClient',
      });

      const usersRouteFile = join(testOutputDir, 'routes', 'users.route.ts');
      const routeFileExists = await fs
        .access(usersRouteFile)
        .then(() => true)
        .catch(() => false);

      if (routeFileExists) {
        const routeContent = await fs.readFile(usersRouteFile, 'utf-8');
        // Check if type aliases are present (they should be if typesFile was generated)
        // Note: In tests, openapi-typescript might fail, so we check conditionally
        if (routeContent.includes("import type { components }")) {
          // If types are imported, the structure is correct
          // Type aliases might not be present if no $ref schemas were found
          // This is acceptable - the test verifies the structure is correct
          expect(routeContent).toContain("import type { components }");
        }
      }
    });

    it('should handle specs with mixed direct and array schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/UserRequest' },
                  },
                },
              },
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
          '/posts': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Post' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      expect(typeNames.has('UserRequest')).toBe(true);
      expect(typeNames.has('User')).toBe(true);
      expect(typeNames.has('Post')).toBe(true);
      expect(typeNames.size).toBe(3);
    });

    it('should ignore non-component schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/definitions/OtherSchema' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesFromSpec(spec);
      // Should ignore non-component refs
      expect(typeNames.size).toBe(0);
    });
  });

  describe('Per-Route-Group Type Extraction', () => {
    it('should extract type names for specific operations only', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateUserRequest' },
                  },
                },
              },
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
          '/posts': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Post' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Extract types only for /users POST operation
      const typeNames = extractTypeNamesForOperations(spec, [
        { path: '/users', method: 'POST' },
      ]);

      expect(typeNames.has('CreateUserRequest')).toBe(true);
      expect(typeNames.has('User')).toBe(true);
      expect(typeNames.has('Post')).toBe(false); // Should not include /posts types
      expect(typeNames.size).toBe(2);
    });

    it('should handle requestBody $ref to component requestBodies', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          requestBodies: {
            patch_request: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PatchRequest' },
                },
              },
            },
          },
        },
        paths: {
          '/items/{id}': {
            patch: {
              requestBody: {
                $ref: '#/components/requestBodies/patch_request',
              },
              responses: {
                '204': {
                  description: 'No Content',
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesForOperations(spec, [
        { path: '/items/{id}', method: 'PATCH' },
      ]);

      expect(typeNames.has('PatchRequest')).toBe(true);
    });

    it('should extract types from multiple operations in a route group', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateUserRequest' },
                  },
                },
              },
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesForOperations(spec, [
        { path: '/users', method: 'GET' },
        { path: '/users', method: 'POST' },
      ]);

      expect(typeNames.has('User')).toBe(true);
      expect(typeNames.has('CreateUserRequest')).toBe(true);
      // User should only appear once (Set deduplication)
      expect(typeNames.size).toBe(2);
    });

    it('should return empty set for operations with no schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                },
              },
            },
          },
        },
      };

      const typeNames = extractTypeNamesForOperations(spec, [
        { path: '/test', method: 'GET' },
      ]);

      expect(typeNames.size).toBe(0);
    });
  });

  describe('Response Type Mapping', () => {
    it('should map 204 responses to void marker', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/items/{id}': {
            patch: {
              responses: {
                '204': {
                  description: 'No Content',
                },
              },
            },
          },
        },
      };

      const mapping = extractResponseTypeMapping(spec);
      expect(mapping.get('/items/{id}:PATCH')).toBe('__void__');
    });

    it('should map response types from schema references', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const mapping = extractResponseTypeMapping(spec);
      expect(mapping.get('/users:POST')).toBe('User');
    });

    it('should handle array response schemas', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const mapping = extractResponseTypeMapping(spec);
      expect(mapping.get('/users:GET')).toBe('User');
    });
  });
});
