import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).end();
  const sql = neon(process.env.DATABASE_URL);
  const { id, prenom, nom, naissance, deces, bio, genre, parentIds, conjointId, photo } = req.body;
  await sql`
    UPDATE membres SET
      prenom=${prenom}, nom=${nom}, naissance=${naissance},
      deces=${deces}, bio=${bio}, genre=${genre},
      "parentIds"=${JSON.stringify(parentIds)},
      "conjointId"=${conjointId}, photo=${photo}
    WHERE id=${id}
  `;
  res.status(200).json({ success: true });
}