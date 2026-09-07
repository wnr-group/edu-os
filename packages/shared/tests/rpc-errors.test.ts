import { describe, it, expect } from 'vitest';
import { rpcErrorMessage, RPC_ERROR_MESSAGES } from '../src/rpc-errors';

describe('rpcErrorMessage (review comment #5)', () => {
  it('maps a known error code to its friendly message', () => {
    expect(rpcErrorMessage({ message: 'not_authorized' }, 'fallback')).toBe(
      RPC_ERROR_MESSAGES.not_authorized
    );
  });

  it('maps module_disabled to a friendly message', () => {
    expect(rpcErrorMessage({ message: 'module_disabled' }, 'fallback')).toBe(
      'Insights is switched off for this school.'
    );
  });

  it('falls back for an unmapped non-empty error code', () => {
    expect(rpcErrorMessage({ message: 'some_unmapped_code' }, 'fallback')).toBe('fallback');
  });

  it('falls back for an empty-string error message (falsy but non-nullish)', () => {
    expect(rpcErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
  });

  it('falls back for a null error', () => {
    expect(rpcErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('falls back for an undefined error', () => {
    expect(rpcErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('falls back for an object with no message property', () => {
    expect(rpcErrorMessage({}, 'fallback')).toBe('fallback');
  });

  it('uses a native Error object message when non-empty', () => {
    expect(rpcErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back for a native Error object with an empty message', () => {
    expect(rpcErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });
});
