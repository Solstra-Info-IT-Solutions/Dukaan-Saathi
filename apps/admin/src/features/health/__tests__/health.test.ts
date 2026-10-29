import { describe, expect, it } from 'vitest';
import { healthAlerts, type SystemHealth } from '../domain/health';

const NOW = Date.parse('2026-10-29T06:00:00.000Z');
const ok: SystemHealth = {
  checkedAt: '2026-10-29T06:00:00.000Z',
  jobs: [
    { job: 'retention', lastRunAt: '2026-10-29T01:15:00.000Z', status: 'succeeded', message: null },
    {
      job: 'subscription-lifecycle',
      lastRunAt: '2026-10-29T00:30:00.000Z',
      status: 'succeeded',
      message: null,
    },
  ],
  salesNeedsReview: 3,
  ticketsWaitingOver24h: 0,
  onboardingNewOver24h: 0,
  paymentEvents24h: 0,
  shopsPastDueOrGrace: 1,
  rateLimitReached1h: 0,
  maintenance: { active: false },
};

describe('healthAlerts', () => {
  it('is quiet when jobs ran and nothing waits', () => {
    expect(healthAlerts(ok, NOW)).toEqual([]);
  });
  it('reports failed and stale jobs as errors', () => {
    const alerts = healthAlerts(
      {
        ...ok,
        jobs: [
          { job: 'retention', lastRunAt: '2026-10-29T01:15:00.000Z', status: 'failed', message: 'deadlock' },
          {
            job: 'subscription-lifecycle',
            lastRunAt: '2026-10-27T00:30:00.000Z',
            status: 'succeeded',
            message: null,
          },
        ],
      },
      NOW,
    );
    expect(alerts).toEqual([
      { level: 'error', text: 'Job retention failed: deadlock' },
      { level: 'error', text: 'Job subscription-lifecycle has not run in the last day' },
    ]);
  });
  it('warns about maintenance, waiting queues and rate limits', () => {
    const texts = healthAlerts(
      {
        ...ok,
        maintenance: { active: true, blocksWrites: true },
        ticketsWaitingOver24h: 2,
        onboardingNewOver24h: 1,
        rateLimitReached1h: 4,
      },
      NOW,
    ).map((a) => a.text);
    expect(texts).toEqual([
      'Maintenance is on and saving is blocked',
      '2 tickets waiting for us over 24 hours',
      '1 onboarding requests not picked up in 24 hours',
      '4 users hit a rate limit in the last hour',
    ]);
  });
});
