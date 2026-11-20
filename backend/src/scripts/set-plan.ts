/** Admin tool (no payment gateway configured): npm run set-plan -w backend -- <email> <free|pro|studio> */
import { sql, sqlOne, pool } from '../database/pool.js';
import { PLANS, type Plan } from '../services/plans.js';
import { addTransaction } from '../services/credits.js';

const [email, plan] = process.argv.slice(2) as [string, Plan];
if (!email || !PLANS[plan]) { console.error('usage: set-plan <email> <free|pro|studio>'); process.exit(1); }
const u = await sqlOne<{ id: string }>('select id from users where lower(email) = lower($1)', [email]);
if (!u) { console.error('user not found'); process.exit(1); }
await sql('update profiles set plan = $1, storage_quota_bytes = $2 where user_id = $3', [plan, PLANS[plan].storage_quota_bytes, u.id]);
await sql(`insert into subscriptions (user_id, plan, status, provider) values ($1,$2,'active','admin') on conflict (user_id) do update set plan = excluded.plan, provider = 'admin', updated_at = now()`, [u.id, plan]);
const month = new Date().toISOString().slice(0, 7);
await addTransaction(u.id, PLANS[plan].monthly_credits, `Plan credits (${PLANS[plan].name}, admin)`, `planchange:${u.id}:${plan}:${month}`, { type: 'plan' });
console.log(`${email} → ${plan}`);
await pool.end();
