import { progressLabel } from './ComposeFooter';

describe('progressLabel', () => {
  it('counts the photo being uploaded, then saving', () => {
    expect(progressLabel({ done: 0, total: 3, stage: 'uploading' })).toBe('Uploading photo 1 of 3…');
    expect(progressLabel({ done: 3, total: 3, stage: 'uploading' })).toBe('Uploading photo 3 of 3…');
    expect(progressLabel({ done: 3, total: 3, stage: 'saving' })).toBe('Saving…');
  });
});
