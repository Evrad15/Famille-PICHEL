import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();
  const sql = neon(process.env.DATABASE_URL);
  const { id } = req.body;
  await sql`DELETE FROM membres WHERE id=${id}`;
  // Nettoyer les références
  await sql`UPDATE membres SET "conjointId"=NULL WHERE "conjointId"=${id}`;
  res.status(200).json({ success: true });
}