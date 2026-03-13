import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const sql = neon(process.env.DATABASE_URL);
  const { id, prenom, nom, naissance, deces, bio, genre, parentIds, conjointId, photo } = req.body;
  await sql`
    INSERT INTO membres (id, prenom, nom, naissance, deces, bio, genre, "parentIds", "conjointId", photo)
    VALUES (${id}, ${prenom}, ${nom}, ${naissance}, ${deces}, ${bio}, ${genre}, ${JSON.stringify(parentIds)}, ${conjointId}, ${photo})
  `;
  res.status(200).json({ success: true });
}