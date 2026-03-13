import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const sql = neon(process.env.DATABASE_URL);
    const { id, prenom, nom, naissance, deces, bio, genre, parentIds, conjointId, photo } = req.body;
    await sql`
      INSERT INTO membres (id, prenom, nom, naissance, deces, bio, genre, "parentIds", "conjointId", photo)
      VALUES (${id}, ${prenom}, ${nom}, ${naissance}, ${deces||null}, ${bio||null}, ${genre}, ${JSON.stringify(parentIds||[])}, ${conjointId||null}, ${photo||null})
    `;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}