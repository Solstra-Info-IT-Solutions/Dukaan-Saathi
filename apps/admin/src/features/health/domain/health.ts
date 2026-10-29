/** admin_system_health (Phase 13, BL-1308). */
export interface SystemHealth {
  checkedAt: string;
  jobs: { job: string; lastRunAt: string | null; status: string | null; message: string | null }[];
  salesNeedsReview: number;
  ticketsWaitingOver24h: number;
  onboardingNewOver24h: number;
  paymentEvents24h: number;
  shopsPastDueOrGrace: number;
  rateLimitReached1h: number;
  maintenance: { active: boolean; blocksWrites?: boolean } | null;
}

export interface HealthAlert {
  level: 'warn' | 'error';
  text: string;
}

const DAY = 86_400_000;

/**
 * What needs an operator now. A daily job that failed or has not run for over a day is an error; queues that wait
 * too long are warnings.
 */
export function healthAlerts(h: SystemHealth, now: number): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  for (const j of h.jobs) {
    if (j.status && j.status !== 'succeeded' && j.status !== 'running') {
      alerts.push({ level: 'error', text: `Job ${j.job} ${j.status}: ${j.message ?? 'no message'}` });
    } else if (!j.lastRunAt || now - Date.parse(j.lastRunAt) > DAY + 3_600_000) {
      alerts.push({ level: 'error', text: `Job ${j.job} has not run in the last day` });
    }
  }
  if (h.maintenance?.active) {
    alerts.push({
      level: 'warn',
      text: h.maintenance.blocksWrites
        ? 'Maintenance is on and saving is blocked'
        : 'Maintenance banner is on',
    });
  }
  if (h.ticketsWaitingOver24h > 0) {
    alerts.push({ level: 'warn', text: `${h.ticketsWaitingOver24h} tickets waiting for us over 24 hours` });
  }
  if (h.onboardingNewOver24h > 0) {
    alerts.push({
      level: 'warn',
      text: `${h.onboardingNewOver24h} onboarding requests not picked up in 24 hours`,
    });
  }
  if (h.rateLimitReached1h > 0) {
    alerts.push({ level: 'warn', text: `${h.rateLimitReached1h} users hit a rate limit in the last hour` });
  }
  return alerts;
}
