import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    if (req.method !== 'PUT') return res.status(405).end();
    const sql = neon(process.env.DATABASE_URL);
    const { id, prenom, nom, naissance, deces, bio, genre, parentIds, conjointId, photo } = req.body;
    await sql`
      UPDATE membres SET
        prenom=${prenom}, nom=${nom}, naissance=${naissance},
        deces=${deces||null}, bio=${bio||null}, genre=${genre},
        "parentIds"=${JSON.stringify(parentIds||[])},
        "conjointId"=${conjointId||null}, photo=${photo||null}
      WHERE id=${id}
    `;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}