import { describe, it, expect } from 'vitest';
import { rpcErrorMessage, RPC_ERROR_MESSAGES } from '../src/rpc-errors';

describe('rpcErrorMessage (review comment #5)', () => {
  it('maps a known error code to its friendly message', () => {
    expect(rpcErrorMessage({ message: 'not_authorized' }, 'fallback')).toBe(
      RPC_ERROR_MESSAGES.not_authorized
    );
  });

  it('maps module_disabled to a module-neutral friendly message', () => {
    // Reworded from an insights-specific string (PR #25 review) — this code
    // is raised by leave/KYC/feedback RPCs too, not just insights ones.
    expect(rpcErrorMessage({ message: 'module_disabled' }, 'fallback')).toBe(
      'This module is switched off for your school.'
    );
  });

  it('maps not_pending, not_found, and invalid_subject (added for PR #25)', () => {
    expect(rpcErrorMessage({ message: 'not_pending' }, 'fallback')).toBe(RPC_ERROR_MESSAGES.not_pending);
    expect(rpcErrorMessage({ message: 'not_found' }, 'fallback')).toBe(RPC_ERROR_MESSAGES.not_found);
    expect(rpcErrorMessage({ message: 'invalid_subject' }, 'fallback')).toBe(RPC_ERROR_MESSAGES.invalid_subject);
  });

  it('maps a known code even when it arrives as a real Error/PostgrestError instance (regression: PostgrestError extends Error, so an earlier version checked `instanceof Error` before ever consulting the map)', () => {
    expect(rpcErrorMessage(new Error('not_pending'), 'fallback')).toBe(RPC_ERROR_MESSAGES.not_pending);
    expect(rpcErrorMessage(new Error('not_authorized'), 'fallback')).toBe(RPC_ERROR_MESSAGES.not_authorized);
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
