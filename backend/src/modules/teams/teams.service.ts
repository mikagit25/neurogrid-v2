import crypto from 'crypto';
import { db } from '../../db';
import { sendTeamInvitationEmail } from '../../utils/mailer';
import { config } from '../../config';

export type TeamRole = 'analyst' | 'manager' | 'admin';

export async function inviteTeamMember(
  ownerId: string,
  email: string,
  role: TeamRole,
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();

  // Prevent owner from inviting themselves
  const { rows: ownerRows } = await db.query(
    'SELECT email FROM users WHERE id = $1',
    [ownerId],
  );
  if (ownerRows[0]?.email?.toLowerCase() === normalizedEmail) {
    throw new Error('Нельзя пригласить самого себя');
  }

  // Check seat limit (max 5 team members per owner)
  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS cnt FROM team_members WHERE owner_id = $1',
    [ownerId],
  );
  if (Number(countRows[0]?.cnt ?? 0) >= 5) {
    throw new Error('Лимит команды: максимум 5 участников');
  }

  // Check if already a member
  const { rows: memberRows } = await db.query(
    `SELECT tm.id FROM team_members tm
     JOIN users u ON u.id = tm.member_user_id
     WHERE tm.owner_id = $1 AND u.email = $2`,
    [ownerId, normalizedEmail],
  );
  if (memberRows.length) throw new Error('Пользователь уже в команде');

  const token = crypto.randomBytes(32).toString('hex');

  await db.query(
    `INSERT INTO team_invitations (owner_id, email, role, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [ownerId, normalizedEmail, role, token],
  );

  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${token}`;
  const { rows: [owner] } = await db.query(
    'SELECT email FROM users WHERE id = $1',
    [ownerId],
  );
  await sendTeamInvitationEmail(normalizedEmail, owner.email, inviteUrl, role).catch(() => {});

  return token;
}

export async function acceptInvitation(token: string, acceptingUserId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT * FROM team_invitations
     WHERE token = $1 AND accepted = false AND expires_at > now()`,
    [token],
  );
  if (!rows.length) throw new Error('Приглашение недействительно или истекло');

  const inv = rows[0];

  // Prevent owner from accepting their own invite
  if (inv.owner_id === acceptingUserId) throw new Error('Нельзя принять собственное приглашение');

  // Mark accepted + create member record
  await db.query('BEGIN');
  try {
    await db.query(
      'UPDATE team_invitations SET accepted = true WHERE id = $1',
      [inv.id],
    );
    await db.query(
      `INSERT INTO team_members (owner_id, member_user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, member_user_id) DO UPDATE SET role = $3`,
      [inv.owner_id, acceptingUserId, inv.role],
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

export async function listTeamMembers(ownerId: string) {
  const { rows } = await db.query(
    `SELECT tm.id, tm.role, tm.created_at,
            u.id AS user_id, u.email, u.name
     FROM team_members tm
     JOIN users u ON u.id = tm.member_user_id
     WHERE tm.owner_id = $1
     ORDER BY tm.created_at ASC`,
    [ownerId],
  );
  return rows;
}

export async function listPendingInvitations(ownerId: string) {
  const { rows } = await db.query(
    `SELECT id, email, role, created_at, expires_at
     FROM team_invitations
     WHERE owner_id = $1 AND accepted = false AND expires_at > now()
     ORDER BY created_at DESC`,
    [ownerId],
  );
  return rows;
}

export async function removeTeamMember(ownerId: string, memberId: string): Promise<void> {
  await db.query(
    'DELETE FROM team_members WHERE id = $1 AND owner_id = $2',
    [memberId, ownerId],
  );
}

export async function revokeInvitation(ownerId: string, invitationId: string): Promise<void> {
  await db.query(
    'DELETE FROM team_invitations WHERE id = $1 AND owner_id = $2',
    [invitationId, ownerId],
  );
}

// Returns the owner's userId if `userId` is a team member, otherwise null
export async function resolveTeamOwner(userId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT owner_id FROM team_members WHERE member_user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.owner_id ?? null;
}

export async function getInvitationByToken(token: string) {
  const { rows } = await db.query(
    `SELECT ti.*, u.email AS owner_email
     FROM team_invitations ti
     JOIN users u ON u.id = ti.owner_id
     WHERE ti.token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
