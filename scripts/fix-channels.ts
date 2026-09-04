import { Pool } from "pg";
import { readFileSync } from "fs";

const lines = readFileSync(".env", "utf8").split("\n");
let dbUrl = "";
for (const l of lines) {
  if (l.startsWith("DATABASE_URL=")) {
    const v = l.slice("DATABASE_URL=".length);
    if (v.length > dbUrl.length) dbUrl = v;
  }
}

const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function fix() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT id, name, community_id, created_by FROM channels WHERE conversation_id IS NULL",
    );
    console.log("Channels without conversation:", res.rows.length);

    for (const ch of res.rows) {
      const convRes = await client.query(
        "INSERT INTO conversations (type, name, created_by_id) VALUES ($1, $2, $3) RETURNING id",
        ["group", ch.name, ch.created_by],
      );
      const convId = convRes.rows[0].id;

      const members = await client.query(
        "SELECT user_id, role FROM community_members WHERE community_id = $1",
        [ch.community_id],
      );
      for (const m of members.rows) {
        const convRole =
          m.role === "owner" ? "admin" : m.role === "admin" ? "admin" : "member";
        await client.query(
          "INSERT INTO conversation_members (conversation_id, user_id, role, accepted_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
          [convId, m.user_id, convRole],
        );
      }

      await client.query("UPDATE channels SET conversation_id = $1 WHERE id = $2", [
        convId,
        ch.id,
      ]);
      console.log("Fixed channel:", ch.name, "-> conversation:", convId);
    }
    console.log("Done!");
  } finally {
    client.release();
    pool.end();
  }
}

fix().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
