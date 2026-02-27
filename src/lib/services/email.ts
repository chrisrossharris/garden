import { env, requireEnv } from '@/lib/env';

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!env.EMAIL_PROVIDER_KEY || !env.EMAIL_FROM) {
    throw new Error('Email provider not configured');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('EMAIL_PROVIDER_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: requireEnv('EMAIL_FROM'),
      to: [input.to],
      subject: input.subject,
      html: input.html
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email failed: ${body}`);
  }
}
