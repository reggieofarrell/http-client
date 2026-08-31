/**
 * Simple color function that uses console color codes for Node.js
 * and falls back to plain text for browsers.
 */
const color =
  (colorCode: string) =>
  (text: string): string => {
    // Prefer a direct undefined check over `typeof` (S7741). `globalThis.window`
    // is a property access, so it cannot throw ReferenceError the way a bare
    // undeclared identifier would.
    if ((globalThis as { window?: unknown }).window === undefined) {
      return `\x1b[${colorCode}m${text}\x1b[0m`;
    }
    return text;
  };

const yellow = color('33');
const green = color('32');
const cyan = color('36');
const red = color('31');

/**
 * Default logging functions, for when a custom error
 * handler is not implemented.
 */

/**
 * Logs a warning to the console
 */
export const logWarning = (message: string) => {
  console.log(yellow(message));
};

/**
 * Logs info to the console
 */
export const logInfo = (message: string) => {
  console.log(green(message));
};

/**
 * Safely stringifies an object to avoid circular references
 *
 * @param obj - The object to stringify
 * @param indent - The indentation level
 * @returns The stringified object
 */
const safeStringify = (obj: any, indent = 2): string => {
  // Tracks only the current chain of ancestors (root -> ... -> the value being processed), not
  // every object seen anywhere in the whole value - a flat "seen anywhere" set can't distinguish
  // a real cycle from an ordinary object legitimately referenced twice at different paths (e.g.
  // the same normalized entity attached under two keys), and falsely reports the second
  // occurrence as '[Circular]', discarding real data. `this` inside JSON.stringify's replacer is
  // the object/array currently holding `value` - popping back to it on each call keeps `ancestors`
  // exactly the path from the root to here, so `ancestors.includes(value)` only matches a genuine
  // cycle.
  const ancestors: unknown[] = [];
  return JSON.stringify(
    obj,
    function (_key, value) {
      if (typeof value !== 'object' || value === null) {
        return value;
      }
      while (ancestors.length > 0 && ancestors.at(-1) !== this) {
        ancestors.pop();
      }
      if (ancestors.includes(value)) {
        return '[Circular]';
      }
      ancestors.push(value);
      return value;
    },
    indent
  );
};

/**
 * Logs data - creates colorized console output for local development.
 *
 * Both parameters are optional with defaults so the defaulted `title` is not
 * followed by a required `data` (S1788: default parameters should be last).
 */
export const logData = (title = '', data: unknown = undefined) => {
  console.log('');
  console.log(cyan(`== ${title} ==`));

  if (data) {
    if (typeof data === 'object') {
      console.log(safeStringify(data));
    } else {
      console.log(data);
    }
  }
};

/**
 * Logs an error to the console
 * @param {*} error
 * @param {string} title - optional title for the error
 */
export const logError = (error: unknown, title?: string) => {
  if (title) {
    console.log('');
    console.log(`== ${title} ==`);
  }

  if (error instanceof Error) {
    console.log(red(error.stack || error.message));

    if ((error as any).cause) {
      console.log('');
      console.log(red('== Error Cause =='));

      if ((error as any).cause instanceof Error) {
        console.log(red((error as any).cause.stack || (error as any).cause.message));
      } else {
        console.log(red(safeStringify((error as any).cause)));
      }
    }
  } else {
    console.error(red(String(error)));
  }
};
