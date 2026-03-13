import { describe, expect, it } from 'vitest';
import {
  buildFocusQueue,
  DEFAULT_OPERATING_PREFERENCES,
  getEnabledAgentCards,
} from '../lib/operating-model';

describe('operating model helpers', () => {
  it('prioritizes verification failures and approvals in the focus queue', () => {
    const queue = buildFocusQueue({
      role: 'cfo',
      preferences: DEFAULT_OPERATING_PREFERENCES,
      tasks: [
        { id: 'task-1', title: 'Review uncategorized transactions', priority: 'urgent', status: 'pending' },
      ],
      workflows: [
        { id: 'wf-1', title: 'Approve roof repair', status: 'requested', costEstimate: '$1,250' },
      ],
      checks: [
        { id: 'close-1', status: 'fail', message: '2 transactions remain uncategorized' },
      ],
    });

    expect(queue[0]?.title).toContain('uncategorized');
    expect(queue.some((item) => item.title.includes('Approve roof repair'))).toBe(true);
  });

  it('marks approval sentinel for attention when approvals are stalled', () => {
    const cards = getEnabledAgentCards({
      role: 'user',
      preferences: {
        ...DEFAULT_OPERATING_PREFERENCES,
        enabledAgentIds: ['approval-sentinel'],
      },
      tasks: [],
      workflows: [{ id: 'wf-1', title: 'Dispatch vendor', status: 'requested' }],
      integrationsConfigured: 3,
      checks: [],
    });

    expect(cards[0]).toMatchObject({
      id: 'approval-sentinel',
      state: 'attention',
      metric: '1 approvals waiting',
    });
  });
});
