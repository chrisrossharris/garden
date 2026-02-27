import fs from 'node:fs';
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Missing STRIPE_SECRET_KEY');

const stripe = new Stripe(key);
const isLive = key.startsWith('sk_live_');
const suffix = isLive ? 'live' : 'test';

const defs = [
  { env: 'STRIPE_PRICE_BLUEPRINT', productName: 'Garden OS Blueprint', productCode: 'blueprint', amount: 7900, recurring: null, lookup: `garden_os_blueprint_${suffix}` },
  { env: 'STRIPE_PRICE_BASIC', productName: 'Garden OS Basic', productCode: 'basic', amount: 1200, recurring: { interval: 'month' }, lookup: `garden_os_basic_${suffix}` },
  { env: 'STRIPE_PRICE_PLUS', productName: 'Garden OS Plus', productCode: 'plus', amount: 2400, recurring: { interval: 'month' }, lookup: `garden_os_plus_${suffix}` },
  { env: 'STRIPE_PRICE_ULTRA', productName: 'Garden OS Ultra', productCode: 'ultra', amount: 3900, recurring: { interval: 'month' }, lookup: `garden_os_ultra_${suffix}` }
];

const out = {};
for (const d of defs) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((p) => p.metadata?.app === 'garden-os' && p.metadata?.code === d.productCode)
    || products.data.find((p) => p.name === d.productName);

  if (!product) {
    product = await stripe.products.create({ name: d.productName, metadata: { app: 'garden-os', code: d.productCode } });
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find((p) =>
    p.unit_amount === d.amount
    && ((d.recurring && p.recurring && p.recurring.interval === d.recurring.interval) || (!d.recurring && !p.recurring))
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: d.amount,
      currency: 'usd',
      recurring: d.recurring || undefined,
      lookup_key: d.lookup,
      metadata: { app: 'garden-os', code: d.productCode }
    });
  }

  out[d.env] = price.id;
}

const envPath = '.env';
let content = fs.readFileSync(envPath, 'utf8');
for (const [k, v] of Object.entries(out)) {
  const rx = new RegExp(`^${k}=.*$`, 'm');
  if (rx.test(content)) content = content.replace(rx, `${k}=${v}`);
  else content += `\n${k}=${v}`;
}
fs.writeFileSync(envPath, content);

console.log(JSON.stringify({ mode: isLive ? 'live' : 'test', ...out }, null, 2));
