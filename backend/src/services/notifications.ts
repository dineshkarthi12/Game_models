import { sql } from '../database/pool.js';
export async function notify(userId: string, kind: string, title: string, body?: string | null, link?: string | null) {
  await sql('insert into notifications (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)', [userId, kind, title, body ?? null, link ?? null]);
}
