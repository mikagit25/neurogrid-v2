import { db } from '../../db';

export async function getScenarios(platform?: string) {
  const query = platform
    ? `SELECT id, slug, title, description, platforms, price, version
       FROM scenarios WHERE is_active = true AND $1 = ANY(platforms)
       ORDER BY title`
    : `SELECT id, slug, title, description, platforms, price, version
       FROM scenarios WHERE is_active = true ORDER BY title`;

  const { rows } = await db.query(query, platform ? [platform] : []);
  return rows;
}

export async function getScenarioBySlug(slug: string) {
  const { rows } = await db.query(
    'SELECT * FROM scenarios WHERE slug = $1 AND is_active = true',
    [slug]
  );
  return rows[0] || null;
}
