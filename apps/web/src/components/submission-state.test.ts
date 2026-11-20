import { describe, expect, it } from 'vitest';
import { initialSubmissionState, submissionReducer } from './submission-state';

describe('submissionReducer', () => {
  it('allows a request through validation error and retry', () => {
    const submitting = submissionReducer(initialSubmissionState, { type: 'begin', requestId: 1 });
    const invalid = submissionReducer(submitting, { type: 'validation-error', requestId: 1, message: 'invalid' });
    expect(invalid).toEqual({ status: 'validation-error', requestId: 1, message: 'invalid' });

    const retrying = submissionReducer(invalid, { type: 'begin', requestId: 2 });
    expect(retrying).toEqual({ status: 'submitting', requestId: 2 });
    expect(submissionReducer(retrying, { type: 'failure', requestId: 2, message: 'failed' })).toEqual({
      status: 'error',
      requestId: 2,
      message: 'failed',
    });
  });

  it('allows a request to complete successfully', () => {
    const submitting = submissionReducer(initialSubmissionState, { type: 'begin', requestId: 7 });
    expect(submissionReducer(submitting, { type: 'success', requestId: 7 })).toEqual({ status: 'success', requestId: 7 });
  });

  it('ignores duplicate starts and transitions without the active request', () => {
    const submitting = submissionReducer(initialSubmissionState, { type: 'begin', requestId: 1 });
    expect(submissionReducer(submitting, { type: 'begin', requestId: 2 })).toBe(submitting);
    expect(submissionReducer(initialSubmissionState, { type: 'success', requestId: 1 })).toBe(initialSubmissionState);
    expect(submissionReducer(submitting, { type: 'failure', requestId: 2, message: 'stale' })).toBe(submitting);
    expect(submissionReducer(submitting, { type: 'validation-error', requestId: 2, message: 'stale' })).toBe(submitting);
  });

  it('ignores a stale response after a retry has started', () => {
    const firstFailure = submissionReducer(
      submissionReducer(initialSubmissionState, { type: 'begin', requestId: 1 }),
      { type: 'failure', requestId: 1, message: 'failed' },
    );
    const retrying = submissionReducer(firstFailure, { type: 'begin', requestId: 2 });
    expect(submissionReducer(retrying, { type: 'success', requestId: 1 })).toBe(retrying);
    expect(submissionReducer(retrying, { type: 'failure', requestId: 1, message: 'stale' })).toBe(retrying);
  });
});
