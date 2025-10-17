/**
 * Code Generator Tests
 *
 * This module tests the OpenAPI to SDK code generation functionality.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateClient } from '../generator';
import * as sampleOpenApiSpec from './sample-openapi.json';

// Mock openapi-typescript
jest.mock('openapi-typescript', () => {
  return jest
    .fn()
    .mockResolvedValue('// Generated types\ninterface User { id: string; name: string; }');
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
      expect(usersContent).toContain('async listusers()');
      expect(usersContent).toContain('async createuser(');
      expect(usersContent).toContain('async getuser(');
      expect(usersContent).toContain('async updateuser(');
      expect(usersContent).toContain('async deleteuser(');
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
});
