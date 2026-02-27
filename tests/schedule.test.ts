import { describe, expect, it } from 'vitest';
import { computeTasks } from '@/lib/engine/schedule';

describe('schedule engine', () => {
  it('computes tasks from last frost offsets', () => {
    const tasks = computeTasks(
      {
        lastFrostStart: '2026-04-10',
        lastFrostEnd: '2026-04-20',
        firstFrostStart: '2026-10-20',
        firstFrostEnd: '2026-11-01'
      },
      [
        {
          templateId: 't1',
          title: 'Tomato: Start seeds indoors',
          instructions: '6-8 weeks before last frost',
          eventType: 'LAST_FROST',
          offsetDaysFromEvent: -49
        }
      ]
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueStart).toBe('2026-02-20');
    expect(tasks[0].dueEnd).toBe('2026-03-02');
    expect(tasks[0].dueDate).toBe('2026-02-25');
  });

  it('computes tasks after last frost', () => {
    const [task] = computeTasks(
      {
        lastFrostStart: '2026-04-15',
        lastFrostEnd: '2026-04-25',
        firstFrostStart: '2026-10-15',
        firstFrostEnd: '2026-10-30'
      },
      [
        {
          templateId: 't2',
          title: 'Cucumber: Direct sow',
          instructions: '1-2 weeks after last frost',
          eventType: 'LAST_FROST',
          offsetDaysFromEvent: 10
        }
      ]
    );

    expect(task.dueStart).toBe('2026-04-25');
    expect(task.dueEnd).toBe('2026-05-05');
  });
});
