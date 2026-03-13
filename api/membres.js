import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const membres = await sql`SELECT * FROM membres ORDER BY id`;
    res.status(200).json(membres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}