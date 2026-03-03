import { describe, expect, it } from 'vitest';

import {
  canTransitionFileStatus,
  isFileDownloadAllowed,
  requireFileStatusTransition,
} from '../src/file-lifecycle.js';

describe('file lifecycle transitions', () => {
  it('allows expected transition path to active', () => {
    expect(canTransitionFileStatus('created', 'stored')).toBe(true);
    expect(canTransitionFileStatus('stored', 'quarantined')).toBe(true);
    expect(canTransitionFileStatus('quarantined', 'scan_pending')).toBe(true);
    expect(canTransitionFileStatus('scan_pending', 'active')).toBe(true);
  });

  it('rejects invalid transition', () => {
    expect(canTransitionFileStatus('created', 'active')).toBe(false);
    expect(() => requireFileStatusTransition('created', 'active')).toThrow(
      /Illegal file status transition/,
    );
  });

  it('allows download only for active status', () => {
    expect(isFileDownloadAllowed('active')).toBe(true);
    expect(isFileDownloadAllowed('quarantined')).toBe(false);
    expect(isFileDownloadAllowed('blocked')).toBe(false);
  });
});
