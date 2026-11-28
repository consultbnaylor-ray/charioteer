import { describe, expect, it } from 'vitest';

import { GARMIN_PRIVACY } from '@/domain/garminConnect';
import { GARMIN_CONNECT_HINT } from '@/domain/garminTip';

import { explanationSplit } from './explanation';

const AI_LEAD = 'Your data is never shared with any party for marketing purposes, and we only use personal information for the functionality of the app.';

describe('explanation split', () => {
  it('keeps the first sentence and leaves the rest for a tab', () => {
    expect(explanationSplit(GARMIN_CONNECT_HINT)).toEqual({
      lead: 'Connect your Garmin to bring in workouts, heart rate and sleep.',
      rest: 'Route maps still need an Apple Watch or iPhone-recorded workout.',
    });
    expect(explanationSplit(GARMIN_PRIVACY).lead).toBe('Garmin readings stay on your account, the same way Apple Health readings do.');
    expect(explanationSplit(GARMIN_PRIVACY).rest).toContain('not sold');
  });

  it('does not break a decimal, and keeps a warning that follows the first sentence', () => {
    expect(explanationSplit('Stay near 1.6 to 2.2 g per kg. Then the longer note.')).toEqual({
      lead: 'Stay near 1.6 to 2.2 g per kg.',
      rest: 'Then the longer note.',
    });
    expect(explanationSplit(`${AI_LEAD} This covers Thumos.`).lead).toBe(AI_LEAD);
    expect(explanationSplit('This choice starts off. xAI has not yet confirmed in writing that they will not save what Thumos sends. Turning this on continues.')).toEqual({
      lead: 'This choice starts off. xAI has not yet confirmed in writing that they will not save what Thumos sends.',
      rest: 'Turning this on continues.',
    });
    expect(explanationSplit('One sentence only.')).toEqual({ lead: 'One sentence only.', rest: '' });
  });
});
