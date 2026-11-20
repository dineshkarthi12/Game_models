import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser, sql, sqlOne } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';
import { PLANS, type Plan } from '../services/plans.js';
import { notify } from '../services/notifications.js';
import { sendEmail } from '../services/email.js';
import { config } from '../config.js';

/** Link pending invitations addressed to this user's email (called on every team listing). */
async function acceptInvites(userId: string, email: string) {
  const rows = await sql<{ team_id: string }>(`update team_members set user_id = $1, status = 'active' where lower(email) = lower($2) and status = 'invited' returning team_id`, [userId, email]);
  for (const r of rows) {
    const t = await sqlOne<{ name: string; owner_id: string }>('select name, owner_id from teams where id = $1', [r.team_id]);
    if (t) await notify(t.owner_id, 'team_joined', 'Invitation accepted', `${email} joined ${t.name}.`, '/app/team');
  }
}

export async function teamRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/teams', async (req) => {
    await acceptInvites(req.user.id, req.user.email || (await sqlOne<{ email: string }>('select email from users where id = $1', [req.user.id]))!.email);
    return asUser(req.user.id, async (db) => {
      const teams = await db.all(`select t.id, t.name, t.owner_id, t.created_at,
          case when t.owner_id = $1 then 'owner' else (select role from team_members m where m.team_id = t.id and m.user_id = $1) end as role
        from teams t order by t.created_at`, [req.user.id]);
      for (const t of teams) {
        t.members = await db.all(`select m.id, m.user_id, m.email, m.role, m.status, m.created_at, p.full_name from team_members m left join profiles p on p.user_id = m.user_id
          where m.team_id = $1 order by m.created_at`, [t.id]);
        t.projects = await db.all('select id, name, updated_at from projects where team_id = $1 order by updated_at desc limit 50', [t.id]);
      }
      return { items: teams };
    });
  });

  app.post('/teams', async (req, reply) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const plan = (await sqlOne<{ plan: Plan }>('select plan from profiles where user_id = $1', [req.user.id]))?.plan ?? 'free';
    if (!PLANS[plan].team_workspace) throw forbidden('Team workspaces are part of the Studio plan.');
    const t = await asUser(req.user.id, async (db) => {
      const me = await db.one<{ email: string }>('select email from users where id = $1', [req.user.id]);
      const team = await db.one('insert into teams (name, owner_id) values ($1,$2) returning id, name, owner_id, created_at', [name, req.user.id]);
      await db.all(`insert into team_members (team_id, user_id, email, role, status, invited_by) values ($1,$2,$3,'owner','active',$2)`, [team.id, req.user.id, me!.email]);
      return team;
    });
    reply.code(201); return t;
  });

  app.post('/teams/:id/invites', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['admin', 'member']).default('member') }), req.body);
    const row = await asUser(req.user.id, async (db) => {
      const t = await db.one('select name from teams where id = $1 and owner_id = $2', [id, req.user.id]);
      if (!t) throw notFound('Team');
      if (await db.one('select 1 from team_members where team_id = $1 and lower(email) = $2', [id, body.email])) throw conflict('That person is already invited');
      const m = await db.one(`insert into team_members (team_id, email, role, status, invited_by) values ($1,$2,$3,'invited',$4) returning id, email, role, status, created_at`, [id, body.email, body.role, req.user.id]);
      return { ...m, team: t.name };
    });
    await sendEmail(body.email, `You were invited to ${row.team} on Vistora 3D`, `Sign in or create an account with this email at ${config.PUBLIC_APP_URL}/login to join.`);
    const existing = await sqlOne<{ id: string }>('select id from users where lower(email) = $1', [body.email]);
    if (existing) await notify(existing.id, 'team_invite', `Invitation to ${row.team}`, 'Open Team Workspace to see shared projects.', '/app/team');
    reply.code(201); return row;
  });

  app.delete('/teams/:id/members/:memberId', async (req) => {
    const { id, memberId } = parse(z.object({ id: uuid, memberId: uuid }), req.params);
    const r = await asUser(req.user.id, (db) => db.all(`delete from team_members where id = $1 and team_id = $2 and role <> 'owner' returning id`, [memberId, id]));
    if (!r.length) throw notFound('Member');
    return { ok: true };
  });

  /** Share / unshare one of your projects with a team you belong to. */
  app.put('/projects/:id/team', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { team_id } = parse(z.object({ team_id: uuid.nullable() }), req.body);
    await asUser(req.user.id, async (db) => {
      if (team_id && !(await db.one('select app_is_team_member($1) as ok', [team_id]))?.ok) throw forbidden('You are not a member of that team');
      const r = await db.all('update projects set team_id = $1 where id = $2 and owner_id = $3 returning id', [team_id, id, req.user.id]);
      if (!r.length) throw notFound('Project');
    });
    return { ok: true };
  });
}
