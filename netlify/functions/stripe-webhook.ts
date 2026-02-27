import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { stripe, subscriptionPlanFromPrice } from '../../src/lib/services/stripe';
import { query, one } from '../../src/lib/db/client';
import { generateBlueprintPdf } from '../../src/lib/services/pdf';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

export const handler: Handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  if (!sig || !event.body) {
    return { statusCode: 400, body: 'Missing signature/body' };
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${(err as Error).message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const gardenSpaceId = session.metadata?.gardenSpaceId;
    const checkoutMode = session.metadata?.checkoutMode;

    if (checkoutMode === 'BLUEPRINT' && userId && gardenSpaceId) {
      const purchase = await one<{ id: string }>(
        `SELECT id FROM purchases WHERE stripe_checkout_session_id = $1 LIMIT 1`,
        [session.id]
      );

      if (purchase) {
        const rows = await query<{
          space_name: string;
          zip: string;
          zone: string;
          last_frost_start: string;
          last_frost_end: string;
          area_name: string;
          sqft: string;
          sun_exposure: string;
          plant_name: string | null;
          quantity: number | null;
          spacing_inches: number | null;
          layout_zone: string | null;
        }>(
          `SELECT
             gs.name AS space_name,
             gs.zip,
             lp.zone,
             lp.last_frost_start::text,
             lp.last_frost_end::text,
             ga.name AS area_name,
             ga.sqft::text,
             ga.sun_exposure::text,
             p.common_name AS plant_name,
             gp.quantity,
             p.spacing_inches,
             gla.zone::text AS layout_zone
           FROM garden_spaces gs
           JOIN location_profiles lp ON lp.zip = gs.zip
           LEFT JOIN garden_areas ga ON ga.garden_space_id = gs.id
           LEFT JOIN garden_plantings gp ON gp.garden_area_id = ga.id
           LEFT JOIN plants p ON p.id = gp.plant_id
           LEFT JOIN garden_layout_allocations gla ON gla.garden_area_id = ga.id AND gla.plant_id = p.id
           WHERE gs.id = $1`,
          [gardenSpaceId]
        );

        if (rows.length > 0) {
          const areasMap = new Map<string, { name: string; sqft: string; sun: string }>();
          const recs: { area: string; plant: string; qty: number; spacing: number; zone?: string | null }[] = [];

          for (const r of rows) {
            if (!r.area_name) continue;
            areasMap.set(r.area_name, { name: r.area_name, sqft: r.sqft, sun: r.sun_exposure });
            if (r.plant_name && r.quantity && r.spacing_inches) {
              recs.push({
                area: r.area_name,
                plant: r.plant_name,
                qty: r.quantity,
                spacing: r.spacing_inches,
                zone: r.layout_zone
              });
            }
          }

          const pdfUrl = await generateBlueprintPdf({
            spaceName: rows[0].space_name,
            zip: rows[0].zip,
            zone: rows[0].zone,
            frostRange: `${rows[0].last_frost_start} to ${rows[0].last_frost_end}`,
            areas: [...areasMap.values()],
            recommendations: recs,
            timeline: [
              { month: 'February', summary: 'Start warm crops indoors.' },
              { month: 'April', summary: 'Prep beds and amend soil.' },
              { month: 'May', summary: 'Transplant and direct sow.' },
              { month: 'June', summary: 'Mulch, water deeply, scout pests.' },
              { month: 'September', summary: 'Harvest and seed fall crops.' }
            ],
            maintenance: ['Weekly irrigation check', 'Mulch refresh each season', 'Monthly fertilization for heavy feeders'],
            purchaseId: purchase.id
          });

          await query(
            `UPDATE purchases
             SET status = 'completed', stripe_payment_intent_id = $1, pdf_url = $2
             WHERE id = $3`,
            [session.payment_intent?.toString() ?? null, pdfUrl, purchase.id]
          );
        }
      }
    }
  }

  if (stripeEvent.type === 'customer.subscription.created' || stripeEvent.type === 'customer.subscription.updated') {
    const subscription = stripeEvent.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;
    const plan = subscriptionPlanFromPrice(subscription.items.data[0].price.id);

    if (userId) {
      await query(
        `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
         ON CONFLICT (stripe_subscription_id)
         DO UPDATE SET plan = EXCLUDED.plan,
                       status = EXCLUDED.status,
                       current_period_end = EXCLUDED.current_period_end`,
        [userId, subscription.customer?.toString() ?? null, subscription.id, plan, subscription.status, subscription.current_period_end]
      );
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data.object as Stripe.Subscription;
    await query(`UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`, [subscription.id]);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
