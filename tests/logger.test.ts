import { logWarning, logInfo, logData, logError } from '../src/logger';

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('logWarning', () => {
    it('should log message with yellow color in Node.js', () => {
      logWarning('test warning');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[33mtest warning\x1b[0m');
    });
  });

  describe('logInfo', () => {
    it('should log message with green color in Node.js', () => {
      logInfo('test info');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[32mtest info\x1b[0m');
    });
  });

  describe('logData', () => {
    it('should log title and string data', () => {
      logData('Test Title', 'test data');
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 'test data');
    });

    it('should log title and object data', () => {
      const testObj = { foo: 'bar' };
      logData('Test Object', testObj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Object ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify(testObj, null, 2));
    });

    it('should handle circular references in object data', () => {
      const circularObj: any = { foo: 'bar' };
      circularObj.self = circularObj;

      logData('Circular Object', circularObj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        3,
        JSON.stringify({ foo: 'bar', self: '[Circular]' }, null, 2)
      );
    });
  });

  describe('logError', () => {
    it('should log Error object with stack trace', () => {
      const error = new Error('test error');
      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with title when provided', () => {
      const error = new Error('test error');
      logError(error, 'Test Error');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '== Test Error ==');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with cause', () => {
      const cause = new Error('cause error');
      const error = new Error('test error', { cause });

      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m== Error Cause ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + cause.stack + '\x1b[0m');
    });

    it('should log non-Error objects', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      logError('string error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('\x1b[31mstring error\x1b[0m');
      consoleErrorSpy.mockRestore();
    });

    it('should log Error with cause but no stack trace', () => {
      const cause = new Error('cause error');
      (cause as any).stack = undefined;
      const error = new Error('test error', { cause });

      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m== Error Cause ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + cause.message + '\x1b[0m');
    });

    it('should log Error with cause that is not an Error object', () => {
      const cause = { message: 'cause error', stack: 'stack trace' };
      const error = new Error('test error');
      (error as any).cause = cause;

      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m== Error Cause ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '\x1b[31m' + JSON.stringify(cause, null, 2) + '\x1b[0m'
      );
    });

    it('should log Error without stack trace', () => {
      const error = new Error('test error');
      (error as any).stack = undefined;

      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.message + '\x1b[0m');
    });

    it('should log Error with empty title', () => {
      const error = new Error('test error');
      logError(error, '');
      // Empty string is falsy, so no title should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with null title', () => {
      const error = new Error('test error');
      logError(error, null as any);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with undefined title', () => {
      const error = new Error('test error');
      logError(error, undefined as any);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
    });
  });

  describe('Browser Compatibility', () => {
    let originalWindow: any;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
    });

    afterEach(() => {
      (globalThis as any).window = originalWindow;
    });

    it('should return plain text in browser environment', () => {
      (globalThis as any).window = {};

      logWarning('test warning');
      expect(consoleLogSpy).toHaveBeenCalledWith('test warning');
    });

    it('should return colored text in Node.js environment', () => {
      delete (globalThis as any).window;

      logWarning('test warning');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[33mtest warning\x1b[0m');
    });
  });

  describe('Edge Cases', () => {
    it('should handle logData with empty title', () => {
      logData('', { test: 'data' });
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m==  ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify({ test: 'data' }, null, 2));
    });

    it('should handle logData with null title', () => {
      logData(null as any, { test: 'data' });
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== null ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify({ test: 'data' }, null, 2));
    });

    it('should handle logData with undefined title', () => {
      logData(undefined as any, { test: 'data' });
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m==  ==\x1b[0m'); // undefined becomes empty string
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify({ test: 'data' }, null, 2));
    });

    it('should handle logData with no data', () => {
      logData('Test Title', undefined);
      // undefined is falsy, so no data should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
    });

    it('should handle logData with null data', () => {
      logData('Test Title', null);
      // null is falsy, so no data should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
    });

    it('should handle logData with undefined data', () => {
      logData('Test Title', undefined);
      // undefined is falsy, so no data should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
    });

    it('should handle logData with number data', () => {
      logData('Test Title', 42);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 42);
    });

    it('should handle logData with boolean data', () => {
      logData('Test Title', true);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, true);
    });

    it('should handle logData with function data', () => {
      const func = () => 'test';
      logData('Test Title', func);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, func);
    });

    it('should handle logData with array data', () => {
      const arr = [1, 2, 3];
      logData('Test Title', arr);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify(arr, null, 2));
    });

    it('should handle logData with deeply nested circular references', () => {
      const obj: any = { level1: { level2: { level3: {} } } };
      obj.level1.level2.level3.parent = obj.level1.level2;
      obj.level1.level2.level3.root = obj;

      logData('Deep Circular', obj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        3,
        JSON.stringify(
          {
            level1: {
              level2: {
                level3: {
                  parent: '[Circular]',
                  root: '[Circular]',
                },
              },
            },
          },
          null,
          2
        )
      );
    });

    it('should handle logData with multiple circular references', () => {
      const obj: any = { a: {}, b: {} };
      obj.a.ref = obj.b;
      obj.b.ref = obj.a;
      obj.a.self = obj.a;

      logData('Multiple Circular', obj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      // The actual output depends on the order of processing
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, expect.stringContaining('[Circular]'));
    });
  });
});
