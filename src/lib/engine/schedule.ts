import dayjs from 'dayjs';

export type EventType = 'LAST_FROST' | 'FIRST_FROST';

export type ProfileDates = {
  lastFrostStart: string;
  lastFrostEnd: string;
  firstFrostStart: string;
  firstFrostEnd: string;
};

export type TemplateRule = {
  templateId: string;
  title: string;
  instructions: string;
  eventType: EventType;
  offsetDaysFromEvent: number;
};

export type ComputedTask = {
  templateId: string;
  title: string;
  instructions: string;
  dueDate: string;
  dueStart: string;
  dueEnd: string;
};

function dateRangeForEvent(profile: ProfileDates, eventType: EventType) {
  if (eventType === 'LAST_FROST') {
    return {
      start: dayjs(profile.lastFrostStart),
      end: dayjs(profile.lastFrostEnd)
    };
  }
  return {
    start: dayjs(profile.firstFrostStart),
    end: dayjs(profile.firstFrostEnd)
  };
}

export function computeTaskInstance(profile: ProfileDates, rule: TemplateRule): ComputedTask {
  const event = dateRangeForEvent(profile, rule.eventType);
  const dueStart = event.start.add(rule.offsetDaysFromEvent, 'day');
  const dueEnd = event.end.add(rule.offsetDaysFromEvent, 'day');
  const midpoint = dueStart.add(Math.floor(dueEnd.diff(dueStart, 'day') / 2), 'day');

  return {
    templateId: rule.templateId,
    title: rule.title,
    instructions: rule.instructions,
    dueDate: midpoint.format('YYYY-MM-DD'),
    dueStart: dueStart.format('YYYY-MM-DD'),
    dueEnd: dueEnd.format('YYYY-MM-DD')
  };
}

export function computeTasks(profile: ProfileDates, rules: TemplateRule[]): ComputedTask[] {
  return rules.map((rule) => computeTaskInstance(profile, rule));
}
