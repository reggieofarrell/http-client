import { stringifyHeaderValue } from '../src/transports/shared';

/**
 * Regression coverage for S6551: header values must never fall through to
 * Object's default stringification (`[object Object]`), which is useless on the wire.
 */
describe('stringifyHeaderValue', () => {
  it('passes strings through unchanged', () => {
    expect(stringifyHeaderValue('text/plain')).toBe('text/plain');
  });

  it('stringifies numbers, booleans, and bigints', () => {
    expect(stringifyHeaderValue(42)).toBe('42');
    expect(stringifyHeaderValue(true)).toBe('true');
    expect(stringifyHeaderValue(false)).toBe('false');
    expect(stringifyHeaderValue(10n)).toBe('10');
  });

  it('joins array values with commas, recursing into each element', () => {
    expect(stringifyHeaderValue(['a', 'b', 3])).toBe('a, b, 3');
  });

  it('JSON-serializes plain objects instead of emitting [object Object]', () => {
    expect(stringifyHeaderValue({ charset: 'utf-8' })).toBe('{"charset":"utf-8"}');
    expect(stringifyHeaderValue({ charset: 'utf-8' })).not.toBe('[object Object]');
  });

  it('falls back to String() for null, undefined, and other primitives', () => {
    expect(stringifyHeaderValue(null)).toBe('null');
    expect(stringifyHeaderValue(undefined)).toBe('undefined');
  });
});
