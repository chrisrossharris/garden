import type { FeatureFlags, SubscriptionPlan } from '@/lib/types/models';

export function flagsFromPlan(plan: SubscriptionPlan | null): FeatureFlags {
  if (plan === 'ULTRA') {
    return { reminders: true, ultraInsights: true, emailDigest: true };
  }
  if (plan === 'PLUS') {
    return { reminders: true, ultraInsights: false, emailDigest: true };
  }
  return { reminders: false, ultraInsights: false, emailDigest: false };
}

export function hasReminderAccess(plan: SubscriptionPlan | null) {
  return plan === 'PLUS' || plan === 'ULTRA';
}

export function hasUltraAccess(plan: SubscriptionPlan | null) {
  return plan === 'ULTRA';
}
