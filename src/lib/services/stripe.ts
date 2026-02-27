import Stripe from 'stripe';
import { env, requireEnv } from '@/lib/env';

export const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2025-02-24.acacia'
});

export type CheckoutMode = 'BLUEPRINT' | 'BASIC' | 'PLUS' | 'ULTRA';

export function priceIdForMode(mode: CheckoutMode) {
  switch (mode) {
    case 'BLUEPRINT':
      return requireEnv('STRIPE_PRICE_BLUEPRINT');
    case 'BASIC':
      return requireEnv('STRIPE_PRICE_BASIC');
    case 'PLUS':
      return requireEnv('STRIPE_PRICE_PLUS');
    case 'ULTRA':
      return requireEnv('STRIPE_PRICE_ULTRA');
  }
}

export function subscriptionPlanFromPrice(priceId: string): 'BASIC' | 'PLUS' | 'ULTRA' {
  if (priceId === env.STRIPE_PRICE_ULTRA) return 'ULTRA';
  if (priceId === env.STRIPE_PRICE_PLUS) return 'PLUS';
  return 'BASIC';
}
