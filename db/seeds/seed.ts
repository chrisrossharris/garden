import { pool } from '../../src/lib/db/client';

await pool.query(`
INSERT INTO plants (common_name, botanical_name, category, spacing_inches, sun, water, bloom_months, harvest_months, is_native, notes, rules_json)
VALUES
  ('Tomato', 'Solanum lycopersicum', 'edible', 24, 'full_sun', 'medium', NULL, ARRAY[7,8,9], false, 'Warm-season crop.', '{"focus":["edible"]}'),
  ('Cucumber', 'Cucumis sativus', 'edible', 18, 'full_sun', 'medium', NULL, ARRAY[7,8], false, 'Train vertically for space savings.', '{"focus":["edible"]}'),
  ('Bell Pepper', 'Capsicum annuum', 'edible', 18, 'full_sun', 'medium', NULL, ARRAY[7,8,9], false, 'Prefers warm nights.', '{"focus":["edible"]}'),
  ('Knock Out Rose', 'Rosa x', 'ornamental', 36, 'full_sun', 'medium', ARRAY[5,6,7,8,9], NULL, false, 'Disease-resistant shrub rose.', '{"focus":["ornamental","roses"]}'),
  ('Purple Coneflower', 'Echinacea purpurea', 'ornamental', 16, 'full_sun', 'low', ARRAY[6,7,8], NULL, true, 'Native pollinator perennial.', '{"focus":["native","pollinator"]}')
ON CONFLICT DO NOTHING;
`);

await pool.query(`
INSERT INTO task_templates (plant_id, kind, title, offset_days_from_event, event_type, instructions)
SELECT p.id, 'seed_start', p.common_name || ': Start seeds indoors',
  CASE WHEN p.common_name = 'Tomato' THEN -49
       WHEN p.common_name = 'Bell Pepper' THEN -63
       ELSE -42 END,
  'LAST_FROST', 'Use trays under grow lights.'
FROM plants p
WHERE p.common_name IN ('Tomato', 'Bell Pepper')
ON CONFLICT DO NOTHING;
`);

await pool.query(`
INSERT INTO task_templates (plant_id, kind, title, offset_days_from_event, event_type, instructions)
SELECT p.id, 'direct_sow', p.common_name || ': Direct sow outdoors',
  10, 'LAST_FROST', 'Sow into warm soil and keep evenly moist.'
FROM plants p
WHERE p.common_name = 'Cucumber'
ON CONFLICT DO NOTHING;
`);

await pool.end();
console.log('Seed complete.');
