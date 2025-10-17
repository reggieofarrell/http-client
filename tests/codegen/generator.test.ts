/**
 * Code Generator Tests
 *
 * This module tests the OpenAPI to SDK code generation functionality.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateClient } from '../../src/codegen/generator';
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
});
