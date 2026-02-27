function readEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.length > 0) return fromProcess;

  try {
    const fromImportMeta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[name];
    if (fromImportMeta && fromImportMeta.length > 0) return fromImportMeta;
  } catch {
    // ignore when import.meta.env is unavailable
  }

  return undefined;
}

export const env = {
  DATABASE_URL: readEnv('DATABASE_URL'),
  CLERK_SECRET_KEY: readEnv('CLERK_SECRET_KEY'),
  PUBLIC_CLERK_PUBLISHABLE_KEY: readEnv('PUBLIC_CLERK_PUBLISHABLE_KEY'),
  STRIPE_SECRET_KEY: readEnv('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: readEnv('STRIPE_WEBHOOK_SECRET'),
  STRIPE_PRICE_BLUEPRINT: readEnv('STRIPE_PRICE_BLUEPRINT'),
  STRIPE_PRICE_BASIC: readEnv('STRIPE_PRICE_BASIC'),
  STRIPE_PRICE_PLUS: readEnv('STRIPE_PRICE_PLUS'),
  STRIPE_PRICE_ULTRA: readEnv('STRIPE_PRICE_ULTRA'),
  ZONE_API_KEY: readEnv('ZONE_API_KEY'),
  FROST_API_KEY: readEnv('FROST_API_KEY'),
  EMAIL_PROVIDER_KEY: readEnv('EMAIL_PROVIDER_KEY'),
  EMAIL_FROM: readEnv('EMAIL_FROM'),
  STORAGE_BUCKET: readEnv('STORAGE_BUCKET'),
  STORAGE_PUBLIC_BASE_URL: readEnv('STORAGE_PUBLIC_BASE_URL'),
  APP_URL: readEnv('APP_URL'),
  OPENAI_API_KEY: readEnv('OPENAI_API_KEY')
};

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
