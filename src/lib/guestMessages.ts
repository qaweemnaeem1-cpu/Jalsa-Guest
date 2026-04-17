import { supabase } from './supabase';

export interface GuestMessage {
  id: string;
  guest_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  message: string;
  is_system: boolean;
  action_type: 'correction' | 'approval' | 'rejection' | 'resubmit' | 'comment' | null;
  created_at: string;
}

interface InsertParams {
  guestId: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  isSystem: boolean;
  actionType: GuestMessage['action_type'];
}

async function insert(p: InsertParams): Promise<void> {
  const { error } = await supabase.from('guest_messages').insert({
    guest_id:    p.guestId,
    user_id:     p.userId,
    user_name:   p.userName,
    user_role:   p.userRole,
    message:     p.message,
    is_system:   p.isSystem,
    action_type: p.actionType,
  });
  if (error) console.error('[guestMessages] insert error:', error.message);
}

type Actor = { id: string; name: string; role: string };

export async function insertCorrectionMessage(guestId: string, user: Actor, message: string): Promise<void> {
  await insert({ guestId, userId: user.id, userName: user.name, userRole: user.role, message, isSystem: false, actionType: 'correction' });
  await insert({ guestId, userId: user.id, userName: 'System', userRole: 'system', message: `⚠️ Status changed to Needs Correction by ${user.name}`, isSystem: true, actionType: 'correction' });
}

export async function insertApprovalMessage(guestId: string, user: Actor, departmentName?: string): Promise<void> {
  const msg = departmentName
    ? `✅ Approved by ${user.name} · Assigned to ${departmentName}`
    : `✅ Approved by ${user.name}`;
  await insert({ guestId, userId: user.id, userName: 'System', userRole: 'system', message: msg, isSystem: true, actionType: 'approval' });
}

export async function insertRejectionMessage(guestId: string, user: Actor, reason: string): Promise<void> {
  if (reason) {
    await insert({ guestId, userId: user.id, userName: user.name, userRole: user.role, message: reason, isSystem: false, actionType: 'rejection' });
  }
  await insert({ guestId, userId: user.id, userName: 'System', userRole: 'system', message: `❌ Rejected by ${user.name}`, isSystem: true, actionType: 'rejection' });
}

export async function insertResubmitMessage(guestId: string, user: Actor): Promise<void> {
  await insert({ guestId, userId: user.id, userName: 'System', userRole: 'system', message: `🔄 Re-submitted by ${user.name}`, isSystem: true, actionType: 'resubmit' });
}

export async function insertCommentMessage(guestId: string, user: Actor, message: string): Promise<void> {
  await insert({ guestId, userId: user.id, userName: user.name, userRole: user.role, message, isSystem: false, actionType: 'comment' });
}
