import type { Handler } from '@netlify/functions';
import dayjs from 'dayjs';
import { query } from '../../src/lib/db/client';
import { sendEmail } from '../../src/lib/services/email';

export const handler: Handler = async () => {
  const due = await query<{
    user_id: string;
    email: string;
    task_id: string;
    title: string;
    due_date: string;
  }>(
    `SELECT u.id AS user_id, u.email, t.id AS task_id, t.title, t.due_date::text
     FROM tasks t
     JOIN garden_spaces gs ON gs.id = t.garden_space_id
     JOIN users u ON u.id = gs.user_id
     JOIN subscriptions s ON s.user_id = u.id
     WHERE t.status = 'todo'
       AND t.due_date >= CURRENT_DATE
       AND t.due_date < CURRENT_DATE + interval '1 day'
       AND s.status IN ('active', 'trialing')
       AND s.plan IN ('PLUS', 'ULTRA')
       AND u.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM notification_logs n WHERE n.task_id = t.id AND n.channel = 'email'
       )`
  );

  const byUser = new Map<string, { email: string; tasks: { id: string; title: string; due: string }[] }>();
  for (const row of due) {
    const entry = byUser.get(row.user_id) ?? { email: row.email, tasks: [] };
    entry.tasks.push({ id: row.task_id, title: row.title, due: row.due_date });
    byUser.set(row.user_id, entry);
  }

  for (const [userId, payload] of byUser.entries()) {
    const list = payload.tasks.map((t) => `<li>${t.title} (${dayjs(t.due).format('MMM D')})</li>`).join('');
    await sendEmail({
      to: payload.email,
      subject: 'Garden OS: Tasks due today',
      html: `<h2>This Week in Garden OS</h2><ul>${list}</ul>`
    });

    for (const task of payload.tasks) {
      await query(`INSERT INTO notification_logs (user_id, task_id, channel) VALUES ($1, $2, 'email') ON CONFLICT DO NOTHING`, [
        userId,
        task.id
      ]);
      await query(`UPDATE tasks SET sent_at = now(), delivery = 'email' WHERE id = $1`, [task.id]);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ sent: due.length }) };
};
