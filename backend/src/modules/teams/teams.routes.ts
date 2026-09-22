import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import {
  inviteTeamMember, acceptInvitation, listTeamMembers, listPendingInvitations,
  removeTeamMember, revokeInvitation, getInvitationByToken,
} from './teams.service';

export const teamsRouter = Router();
teamsRouter.use(authenticate);

// GET /api/teams/members
teamsRouter.get('/members', async (req: Request, res: Response) => {
  try {
    const members = await listTeamMembers(req.user!.userId);
    const pending = await listPendingInvitations(req.user!.userId);
    res.json({ members, pending });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['analyst', 'manager', 'admin']).default('analyst'),
});

// POST /api/teams/invite
teamsRouter.post('/invite', async (req: Request, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { email, role: memberRole } = parsed.data;
  try {
    const token = await inviteTeamMember(req.user!.userId, email, memberRole as any);
    res.json({ ok: true, token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/teams/members/:id
teamsRouter.delete('/members/:id', async (req: Request, res: Response) => {
  try {
    await removeTeamMember(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/teams/invitations/:id
teamsRouter.delete('/invitations/:id', async (req: Request, res: Response) => {
  try {
    await revokeInvitation(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const acceptSchema = z.object({ token: z.string().min(1) });

// POST /api/teams/accept — called by the invitee after logging in
teamsRouter.post('/accept', async (req: Request, res: Response) => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'token required' }); return; }
  const { token } = parsed.data;
  try {
    await acceptInvitation(token, req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/teams/invitation-info?token=... — public endpoint (no auth) to show invite details
teamsRouter.get('/invitation-info', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) { res.status(400).json({ error: 'token required' }); return; }
  try {
    const inv = await getInvitationByToken(token);
    if (!inv) { res.status(404).json({ error: 'Invitation not found or expired' }); return; }
    res.json({
      email: inv.email,
      owner_email: inv.owner_email,
      role: inv.role,
      expires_at: inv.expires_at,
      accepted: inv.accepted,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
