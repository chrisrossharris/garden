import type { Handler } from '@netlify/functions';
import { stripe, priceIdForMode, type CheckoutMode } from '../../src/lib/services/stripe';
import { query } from '../../src/lib/db/client';
import { env } from '../../src/lib/env';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const body = JSON.parse(event.body ?? '{}') as {
    mode: CheckoutMode;
    userId: string;
    gardenSpaceId?: string;
    customerEmail?: string;
  };

  const isSubscription = body.mode !== 'BLUEPRINT';
  const price = priceIdForMode(body.mode);

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    line_items: [{ price, quantity: 1 }],
    success_url: `${env.APP_URL ?? 'http://localhost:4321'}/app/settings?checkout=success`,
    cancel_url: `${env.APP_URL ?? 'http://localhost:4321'}/pricing?checkout=cancelled`,
    customer_email: body.customerEmail,
    metadata: {
      userId: body.userId,
      gardenSpaceId: body.gardenSpaceId ?? '',
      checkoutMode: body.mode
    }
  });

  if (body.mode === 'BLUEPRINT' && body.gardenSpaceId) {
    await query(
      `INSERT INTO purchases (user_id, garden_space_id, kind, stripe_checkout_session_id, status)
       VALUES ($1, $2, 'BLUEPRINT', $3, 'pending')`,
      [body.userId, body.gardenSpaceId, session.id]
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
};
