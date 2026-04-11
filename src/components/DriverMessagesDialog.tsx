/**
 * Driver Messages / Communication Panel
 * Used by: DriverAllDriversPage, LocationDriversPage, DeptDriversPage, AdminDriversPage (manager side)
 *          DriverDashboardPage (driver side — inline, not dialog)
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ── types ─────────────────────────────────────────────────────────────────────

export interface DriverMessage {
  id: string;
  from_id: string;
  from_name: string;
  from_role?: string;
  to_driver_id: string;
  to_driver_name?: string;
  message: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface DriverMessagesDialogProps {
  open: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  currentUser: CurrentUser;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ROLE_LABELS: Record<string, string> = {
  driver:           'Driver',
  'head-driver':    'Nazim Transport',
  'location-manager': 'Location Manager',
  'department-head':  'Department Head',
  'super-admin':    'Super Admin',
};

// ── component ─────────────────────────────────────────────────────────────────

export function DriverMessagesDialog({
  open, onClose, driverId, driverName, currentUser,
}: DriverMessagesDialogProps) {
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // fetch + subscribe
  useEffect(() => {
    if (!open || !driverId) return;
    setLoading(true);
    setText('');

    supabase
      .from('driver_messages')
      .select('*')
      .eq('to_driver_id', driverId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages((data ?? []) as DriverMessage[]);
        setLoading(false);
      });

    // Mark unread as read (messages sent TO this driver that weren't from this driver)
    supabase
      .from('driver_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('to_driver_id', driverId)
      .eq('is_read', false)
      .neq('from_id', currentUser.id)
      .then(() => {}); // fire and forget

    // Real-time
    const ch = supabase
      .channel(`driver-msgs-${driverId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${driverId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as DriverMessage]);
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [open, driverId, currentUser.id]);

  // scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      const isDriver = currentUser.id === driverId;
      const { error } = await supabase.from('driver_messages').insert({
        from_id:        currentUser.id,
        from_name:      currentUser.name,
        from_role:      currentUser.role,
        to_driver_id:   driverId,
        to_driver_name: driverName,
        message:        msg,
        is_read:        isDriver, // driver's own messages are auto-read
      });
      if (error) throw error;
      setText('');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Group messages by date
  let lastDate = '';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md h-[560px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-[#E8E3DB] shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4 text-[#2D5A45]" />
            Messages — {driverName}
          </DialogTitle>
        </DialogHeader>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#F5F0E8]/30">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#2D5A45]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-[#4A4A4A] text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-[#D4CFC7]" />
              No messages yet. Start the conversation.
            </div>
          ) : (
            messages.map(m => {
              const isMine = m.from_id === currentUser.id;
              const dateStr = new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
              const showDate = dateStr !== lastDate;
              lastDate = dateStr;

              return (
                <div key={m.id}>
                  {showDate && (
                    <div className="text-center text-xs text-[#4A4A4A] py-1">
                      <span className="bg-[#D4CFC7]/50 px-2 py-0.5 rounded-full">{fmtDate(m.created_at)}</span>
                    </div>
                  )}
                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      isMine ? 'bg-[#D6E4D9] text-[#1A1A1A]' : 'bg-white border border-[#E8E3DB] text-[#1A1A1A]'
                    }`}>
                      <div className={`flex items-center gap-1.5 mb-1 text-xs font-medium ${isMine ? 'justify-end text-[#2D5A45]' : 'text-[#4A4A4A]'}`}>
                        <span>{m.from_name}</span>
                        {m.from_role && <span className="opacity-60">· {ROLE_LABELS[m.from_role] ?? m.from_role}</span>}
                        <span className="opacity-60">{fmtTime(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[#E8E3DB] bg-white shrink-0 flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={2}
            className="flex-1 border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="p-2.5 bg-[#2D5A45] hover:bg-[#234839] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline messages panel (for Driver Dashboard) ──────────────────────────────

interface InlineMessagesPanelProps {
  currentUser: CurrentUser;
  onOpenConversation?: () => void;
}

export function InlineMessagesPanel({ currentUser, onOpenConversation }: InlineMessagesPanelProps) {
  const [messages, setMessages]     = useState<DriverMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchMessages();

    const ch = supabase
      .channel(`my-driver-msgs-${currentUser.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${currentUser.id}` },
        (payload) => {
          const msg = payload.new as DriverMessage;
          setMessages(prev => [...prev, msg]);
          if (msg.from_id !== currentUser.id && !msg.is_read) {
            setUnreadCount(c => c + 1);
            toast.info(`New message from ${msg.from_name}`);
          }
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMessages() {
    const { data } = await supabase
      .from('driver_messages')
      .select('*')
      .eq('to_driver_id', currentUser.id)
      .order('created_at', { ascending: true })
      .limit(50);
    const msgs = (data ?? []) as DriverMessage[];
    setMessages(msgs);
    setUnreadCount(msgs.filter(m => !m.is_read && m.from_id !== currentUser.id).length);
    setLoading(false);
  }

  const markRead = async () => {
    await supabase
      .from('driver_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('to_driver_id', currentUser.id)
      .eq('is_read', false)
      .neq('from_id', currentUser.id);
    setUnreadCount(0);
    setMessages(prev => prev.map(m =>
      (!m.is_read && m.from_id !== currentUser.id) ? { ...m, is_read: true } : m
    ));
  };

  const handleExpand = () => {
    setExpanded(true);
    markRead();
    onOpenConversation?.();
  };

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      const { error } = await supabase.from('driver_messages').insert({
        from_id:      currentUser.id,
        from_name:    currentUser.name,
        from_role:    currentUser.role,
        to_driver_id: currentUser.id,
        message:      msg,
        is_read:      true,
      });
      if (error) throw error;
      setText('');
    } catch {
      toast.error('Failed to send');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, expanded]);

  const recentMessages = expanded ? messages : messages.slice(-3);

  return (
    <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E3DB]">
        <h2 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#2D5A45]" />
          Messages
          {unreadCount > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{unreadCount} unread</span>
          )}
        </h2>
        {messages.length > 3 && (
          <button
            onClick={expanded ? () => setExpanded(false) : handleExpand}
            className="text-xs text-[#2D5A45] hover:underline"
          >
            {expanded ? 'Show less' : 'View all'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#2D5A45]" /></div>
      ) : messages.length === 0 ? (
        <div className="text-center py-6 text-sm text-[#4A4A4A]">No messages yet.</div>
      ) : (
        <>
          <div className={`divide-y divide-[#E8E3DB] ${expanded ? 'max-h-64 overflow-y-auto' : ''}`}>
            {recentMessages.map(m => {
              const isUnread = !m.is_read && m.from_id !== currentUser.id;
              return (
                <div
                  key={m.id}
                  className={`px-5 py-3 ${isUnread ? 'bg-amber-50/50' : ''}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isUnread ? 'bg-red-500' : 'bg-green-500'}`} />
                    <span className="text-xs font-medium text-[#4A4A4A]">
                      {m.from_name}
                      {m.from_role && ` · ${ROLE_LABELS[m.from_role] ?? m.from_role}`}
                    </span>
                    <span className="text-xs text-[#D4CFC7] ml-auto">{fmtTime(m.created_at)}</span>
                  </div>
                  <p className="text-sm text-[#1A1A1A] truncate">{m.message}</p>
                </div>
              );
            })}
            {expanded && <div ref={bottomRef} />}
          </div>

          {expanded && (
            <div className="px-4 py-3 border-t border-[#E8E3DB] flex items-end gap-2 bg-[#F5F0E8]/30">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Reply…"
                rows={2}
                className="flex-1 border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="p-2.5 bg-[#2D5A45] hover:bg-[#234839] text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Unread count hook (for sidebar badge) ─────────────────────────────────────

export function useDriverUnreadCount(driverId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!driverId) return;

    supabase
      .from('driver_messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_driver_id', driverId)
      .eq('is_read', false)
      .neq('from_id', driverId)
      .then(({ count: c }) => setCount(c ?? 0));

    const ch = supabase
      .channel(`unread-badge-${driverId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${driverId}` },
        (payload) => {
          const m = payload.new as DriverMessage;
          if (m.from_id !== driverId && !m.is_read) setCount(c => c + 1);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${driverId}` },
        () => {
          // Re-fetch on any update (e.g. mark read)
          supabase
            .from('driver_messages')
            .select('id', { count: 'exact', head: true })
            .eq('to_driver_id', driverId)
            .eq('is_read', false)
            .neq('from_id', driverId)
            .then(({ count: c }) => setCount(c ?? 0));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [driverId]);

  return count;
}
