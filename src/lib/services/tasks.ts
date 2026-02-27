import { query } from '@/lib/db/client';
import { computeTasks, type ProfileDates, type TemplateRule } from '@/lib/engine/schedule';
import dayjs from 'dayjs';

export async function regenerateTasksForSpace(spaceId: string) {
  const rows = await query<{
    planting_id: string;
    template_id: string;
    title: string;
    instructions: string;
    event_type: 'LAST_FROST' | 'FIRST_FROST';
    offset_days_from_event: number;
    last_frost_start: string;
    last_frost_end: string;
    first_frost_start: string;
    first_frost_end: string;
  }>(
    `SELECT
       gp.id AS planting_id,
       tt.id AS template_id,
       tt.title,
       tt.instructions,
       tt.event_type,
       tt.offset_days_from_event,
       lp.last_frost_start::text,
       lp.last_frost_end::text,
       lp.first_frost_start::text,
       lp.first_frost_end::text
     FROM garden_spaces gs
     JOIN garden_areas ga ON ga.garden_space_id = gs.id
     JOIN garden_plantings gp ON gp.garden_area_id = ga.id
     JOIN task_templates tt ON tt.plant_id = gp.plant_id
     JOIN location_profiles lp ON lp.zip = gs.zip
     WHERE gs.id = $1`,
    [spaceId]
  );

  await query(
    `DELETE FROM tasks
     WHERE garden_space_id = $1
       AND auto_generated = true
       AND status = 'todo'`,
    [spaceId]
  );

  for (const row of rows) {
    const profile: ProfileDates = {
      lastFrostStart: row.last_frost_start,
      lastFrostEnd: row.last_frost_end,
      firstFrostStart: row.first_frost_start,
      firstFrostEnd: row.first_frost_end
    };

    const rules: TemplateRule[] = [
      {
        templateId: row.template_id,
        title: row.title,
        instructions: row.instructions,
        eventType: row.event_type,
        offsetDaysFromEvent: row.offset_days_from_event
      }
    ];

    const [task] = computeTasks(profile, rules);
    await query(
      `INSERT INTO tasks (garden_space_id, planting_id, title, due_date, due_start, due_end, status, delivery, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, 'todo', 'in_app', $7)`,
      [spaceId, row.planting_id, task.title, task.dueDate, task.dueStart, task.dueEnd, task.instructions]
    );
  }
}

export async function listTimelineTasks(spaceId: string) {
  return query<{
    id: string;
    title: string;
    due_date: string;
    status: 'todo' | 'done' | 'snoozed';
    instructions: string | null;
  }>(
    `SELECT id, title, due_date::text, status, instructions
     FROM tasks
     WHERE garden_space_id = $1
     ORDER BY due_date ASC`,
    [spaceId]
  );
}

export async function completeTask(taskId: string, spaceId: string) {
  await query(`UPDATE tasks SET status = 'done' WHERE id = $1 AND garden_space_id = $2`, [taskId, spaceId]);
}

export async function reopenTask(taskId: string, spaceId: string) {
  await query(
    `UPDATE tasks
     SET status = 'todo'
     WHERE id = $1 AND garden_space_id = $2`,
    [taskId, spaceId]
  );
}

export async function snoozeTask(taskId: string, spaceId: string, days = 3) {
  await query(
    `UPDATE tasks
     SET status = 'snoozed', due_date = due_date + make_interval(days => $3)
     WHERE id = $1 AND garden_space_id = $2`,
    [taskId, spaceId, days]
  );
}

export async function completeDueToday(spaceId: string) {
  await query(
    `UPDATE tasks
     SET status = 'done'
     WHERE garden_space_id = $1
       AND status = 'todo'
       AND due_date = CURRENT_DATE`,
    [spaceId]
  );
}

export async function snoozeOverdue(spaceId: string, days = 2) {
  await query(
    `UPDATE tasks
     SET status = 'snoozed', due_date = due_date + make_interval(days => $2)
     WHERE garden_space_id = $1
       AND status = 'todo'
       AND due_date < CURRENT_DATE`,
    [spaceId, days]
  );
}

export async function getDashboardTaskSummary(userId: string) {
  const [counts] = await query<{
    due_today: number;
    due_this_week: number;
    overdue: number;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date = CURRENT_DATE)::int AS due_today,
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + interval '7 days')::int AS due_this_week,
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date < CURRENT_DATE)::int AS overdue
     FROM tasks t
     JOIN garden_spaces gs ON gs.id = t.garden_space_id
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $1
     WHERE gs.user_id = $1 OR sm.user_id = $1`,
    [userId]
  );

  const [nextTask] = await query<{
    space_id: string;
    space_name: string;
    title: string;
    due_date: string;
  }>(
    `SELECT gs.id AS space_id, gs.name AS space_name, t.title, t.due_date::text
     FROM tasks t
     JOIN garden_spaces gs ON gs.id = t.garden_space_id
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $1
     WHERE (gs.user_id = $1 OR sm.user_id = $1)
       AND t.status = 'todo'
       AND t.due_date >= CURRENT_DATE
     ORDER BY t.due_date ASC
     LIMIT 1`,
    [userId]
  );

  return {
    dueToday: counts?.due_today ?? 0,
    dueThisWeek: counts?.due_this_week ?? 0,
    overdue: counts?.overdue ?? 0,
    nextTask: nextTask ?? null
  };
}

export async function autoPlanNext14Days(spaceId: string) {
  const today = dayjs().startOf('day');
  const horizon = today.add(14, 'day');

  const rows = await query<{
    planting_id: string;
    template_id: string;
    title: string;
    instructions: string;
    event_type: 'LAST_FROST' | 'FIRST_FROST';
    offset_days_from_event: number;
    last_frost_start: string;
    last_frost_end: string;
    first_frost_start: string;
    first_frost_end: string;
  }>(
    `SELECT
       gp.id AS planting_id,
       tt.id AS template_id,
       tt.title,
       tt.instructions,
       tt.event_type,
       tt.offset_days_from_event,
       lp.last_frost_start::text,
       lp.last_frost_end::text,
       lp.first_frost_start::text,
       lp.first_frost_end::text
     FROM garden_spaces gs
     JOIN garden_areas ga ON ga.garden_space_id = gs.id
     JOIN garden_plantings gp ON gp.garden_area_id = ga.id
     JOIN task_templates tt ON tt.plant_id = gp.plant_id
     JOIN location_profiles lp ON lp.zip = gs.zip
     WHERE gs.id = $1`,
    [spaceId]
  );

  let inserted = 0;

  for (const row of rows) {
    const profile: ProfileDates = {
      lastFrostStart: row.last_frost_start,
      lastFrostEnd: row.last_frost_end,
      firstFrostStart: row.first_frost_start,
      firstFrostEnd: row.first_frost_end
    };
    const rule: TemplateRule = {
      templateId: row.template_id,
      title: row.title,
      instructions: row.instructions,
      eventType: row.event_type,
      offsetDaysFromEvent: row.offset_days_from_event
    };

    const [task] = computeTasks(profile, [rule]);
    const due = dayjs(task.dueDate);
    if (due.isBefore(today, 'day') || due.isAfter(horizon, 'day')) continue;

    const existing = await query<{ id: string }>(
      `SELECT id
       FROM tasks
       WHERE garden_space_id = $1
         AND planting_id = $2
         AND title = $3
         AND due_date = $4::date
       LIMIT 1`,
      [spaceId, row.planting_id, task.title, task.dueDate]
    );
    if (existing.length > 0) continue;

    await query(
      `INSERT INTO tasks (garden_space_id, planting_id, title, due_date, due_start, due_end, status, delivery, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, 'todo', 'in_app', $7)`,
      [spaceId, row.planting_id, task.title, task.dueDate, task.dueStart, task.dueEnd, task.instructions]
    );
    inserted += 1;
  }

  const maintenanceTitle = 'Weekly garden check: water, weeds, pests';
  const maintenanceDue = today.add(3, 'day').format('YYYY-MM-DD');
  const maintenanceExisting = await query<{ id: string }>(
    `SELECT id FROM tasks
     WHERE garden_space_id = $1
       AND title = $2
       AND due_date = $3::date
     LIMIT 1`,
    [spaceId, maintenanceTitle, maintenanceDue]
  );
  if (maintenanceExisting.length === 0) {
    await query(
      `INSERT INTO tasks (garden_space_id, title, due_date, status, delivery, instructions, auto_generated)
       VALUES ($1, $2, $3, 'todo', 'in_app', $4, true)`,
      [spaceId, maintenanceTitle, maintenanceDue, 'Walk each bed for moisture, weeds, and pest pressure.']
    );
    inserted += 1;
  }

  return { inserted };
}

export async function getWeeklyDigestData(userId: string) {
  const [counts] = await query<{
    overdue: number;
    due_today: number;
    due_week: number;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date < CURRENT_DATE)::int AS overdue,
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date = CURRENT_DATE)::int AS due_today,
      COUNT(*) FILTER (WHERE t.status = 'todo' AND t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + interval '7 days')::int AS due_week
     FROM tasks t
     JOIN garden_spaces gs ON gs.id = t.garden_space_id
     WHERE gs.user_id = $1`,
    [userId]
  );

  const actions = await query<{
    task_id: string;
    space_id: string;
    space_name: string;
    title: string;
    due_date: string;
    instructions: string | null;
  }>(
    `SELECT t.id AS task_id, gs.id AS space_id, gs.name AS space_name, t.title, t.due_date::text, t.instructions
     FROM tasks t
     JOIN garden_spaces gs ON gs.id = t.garden_space_id
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $1
     WHERE (gs.user_id = $1 OR sm.user_id = $1)
       AND t.status = 'todo'
       AND t.due_date <= CURRENT_DATE + interval '7 days'
     ORDER BY t.due_date ASC
     LIMIT 3`,
    [userId]
  );

  const [profile] = await query<{
    space_id: string;
    space_name: string;
    zip: string;
    zone: string;
    last_frost_start: string;
    last_frost_end: string;
    first_frost_start: string;
    first_frost_end: string;
  }>(
    `SELECT
      gs.id AS space_id,
      gs.name AS space_name,
      gs.zip,
      lp.zone,
      lp.last_frost_start::text,
      lp.last_frost_end::text,
      lp.first_frost_start::text,
      lp.first_frost_end::text
     FROM garden_spaces gs
     JOIN location_profiles lp ON lp.zip = gs.zip
     LEFT JOIN space_members sm ON sm.garden_space_id = gs.id AND sm.user_id = $1
     WHERE gs.user_id = $1 OR sm.user_id = $1
     ORDER BY gs.created_at ASC
     LIMIT 1`,
    [userId]
  );

  const actionsBullets = actions.length
    ? actions.map((a) => `- ${a.title} (${a.space_name}, due ${a.due_date})`)
    : ['- No pending tasks in the next 7 days.'];

  const summary =
    counts?.overdue && counts.overdue > 0
      ? `${counts.overdue} overdue task${counts.overdue === 1 ? '' : 's'} should be handled first.`
      : counts?.due_today && counts.due_today > 0
        ? `${counts.due_today} task${counts.due_today === 1 ? '' : 's'} due today.`
        : 'No urgent tasks today. Focus on maintenance and prep.';

  const weatherLine = profile
    ? `ZIP ${profile.zip} (zone ${profile.zone}). Frost window: ${profile.last_frost_start} to ${profile.last_frost_end}.`
    : 'Add a space ZIP to personalize climate timing.';

  return {
    counts: {
      overdue: counts?.overdue ?? 0,
      dueToday: counts?.due_today ?? 0,
      dueWeek: counts?.due_week ?? 0
    },
    actions,
    profile: profile ?? null,
    digestText: `${summary}\n${weatherLine}\nTop actions:\n${actionsBullets.join('\n')}`
  };
}
