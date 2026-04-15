/**
 * /driver/messages — Full messages page for regular drivers.
 * Shows all conversations this driver has with transport heads, managers, admins.
 * Real-time updates; marks as read on open.
 */
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import type { DriverMessage } from '@/components/DriverMessagesDialog';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ROLE_LABELS: Record<string, string> = {
  driver:               'Driver',
  'head-driver':        'Nazim Transport',
  'transport-head':     'Transport Head',
  'location-manager':   'Location Manager',
  'department-head':    'Department Head',
  'super-admin':        'Super Admin',
  'desk-in-charge':     'Desk In-Charge',
};

// ── types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  role?: string;
  unreadCount: number;
  lastMessage?: string;
  lastTime?: string;
}

// ── chat thread ───────────────────────────────────────────────────────────────

function ChatThread({
  contact, currentUser, onMarkRead,
}: {
  contact: Contact;
  currentUser: { id: string; name: string; role: string };
  onMarkRead: () => void;
}) {
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    setLoading(true);
    setText('');

    // Load all messages between me and this contact
    supabase
      .from('driver_messages')
      .select('*')
      .or(
        `and(from_id.eq.${currentUser.id},to_driver_id.eq.${contact.id}),` +
        `and(from_id.eq.${contact.id},to_driver_id.eq.${currentUser.id})`
      )
      .order('created_at')
      .then(({ data }) => {
        setMessages((data as DriverMessage[]) ?? []);
        setLoading(false);
        // Mark as read
        supabase.from('driver_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('to_driver_id', currentUser.id)
          .eq('from_id', contact.id)
          .eq('is_read', false)
          .then(() => onMarkRead());
      });

    // Subscribe
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`driver-chat-${contact.id}-${currentUser.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages' },
        payload => {
          const msg = payload.new as DriverMessage;
          const relevant =
            (msg.from_id === currentUser.id && msg.to_driver_id === contact.id) ||
            (msg.from_id === contact.id && msg.to_driver_id === currentUser.id);
          if (relevant) {
            setMessages(prev => [...prev, msg]);
            if (msg.from_id === contact.id) {
              toast(`💬 New message from ${contact.name}`);
              supabase.from('driver_messages')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', msg.id)
                .then(() => {});
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, currentUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setText('');
    try {
      const { error } = await supabase.from('driver_messages').insert({
        from_id:        currentUser.id,
        from_name:      currentUser.name,
        from_role:      currentUser.role,
        to_driver_id:   contact.id,
        to_driver_name: contact.name,
        message:        msg,
        is_read:        false,
      });
      if (error) throw error;
    } catch {
      toast.error('Failed to send message');
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  let lastDate = '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[#4A4A4A]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center py-10 text-sm text-[#4A4A4A] italic">
            No messages yet. Start the conversation!
          </p>
        ) : (
          messages.map(m => {
            const isMe = m.from_id === currentUser.id;
            const date = fmtDate(m.created_at);
            const showDate = date !== lastDate;
            lastDate = date;
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-[#E8E3DB]" />
                    <span className="text-xs text-[#4A4A4A] px-2">{date}</span>
                    <div className="flex-1 h-px bg-[#E8E3DB]" />
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isMe
                      ? 'bg-[#2D5A45] text-white rounded-tr-sm'
                      : 'bg-white border border-[#E8E3DB] text-[#1A1A1A] rounded-tl-sm'
                  }`}>
                    {!isMe && (
                      <p className="text-[10px] font-semibold text-[#4A4A4A] mb-0.5">
                        {m.from_name}
                        {m.from_role && m.from_role !== 'driver'
                          ? ` · ${ROLE_LABELS[m.from_role] ?? m.from_role}` : ''}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? 'text-white/70 text-right' : 'text-[#4A4A4A]'}`}>
                      {fmtTime(m.created_at)}
                      {isMe && m.is_read && <span className="ml-1">✓✓</span>}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#E8E3DB] p-3 bg-white flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Message ${contact.name}…`}
          className="flex-1 border border-[#E8E3DB] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-[#F5F0E8]"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="flex items-center justify-center w-9 h-9 bg-[#2D5A45] text-white rounded-xl hover:bg-[#234839] transition-colors disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverMessagesPage() {
  const { user } = useAuth();

  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const loadedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── load contacts ─────────────────────────────────────────────────────────
  const loadContacts = async (uid: string) => {
    // All messages involving this driver
    const { data } = await supabase
      .from('driver_messages')
      .select('*')
      .or(`to_driver_id.eq.${uid},from_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    const msgs = (data ?? []) as DriverMessage[];

    // Build contact map keyed by the "other party" id
    const contactMap: Record<string, Contact> = {};

    for (const m of msgs) {
      const otherId   = m.from_id === uid ? m.to_driver_id : m.from_id;
      const otherName = m.from_id === uid ? (m.to_driver_name ?? otherId) : m.from_name;
      const otherRole = m.from_id === uid ? undefined : m.from_role;
      if (!otherId) continue;
      if (!contactMap[otherId]) {
        contactMap[otherId] = {
          id:          otherId,
          name:        otherName,
          role:        otherRole,
          unreadCount: 0,
          lastMessage: m.message,
          lastTime:    m.created_at,
        };
      }
      // Count unread from this contact to me
      if (m.from_id === otherId && m.to_driver_id === uid && !m.is_read) {
        contactMap[otherId].unreadCount++;
      }
    }

    const list = Object.values(contactMap);
    setContacts(list);
    if (list.length > 0 && !selectedContact) setSelectedContact(list[0]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;
    loadContacts(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── real-time: new incoming messages → add to contacts if new sender ──────
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('driver-messages-contacts')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${user.id}` },
        payload => {
          const m = payload.new as DriverMessage;
          setContacts(prev => {
            const exists = prev.find(c => c.id === m.from_id);
            if (exists) {
              return prev.map(c => c.id === m.from_id
                ? { ...c, unreadCount: c.unreadCount + 1, lastMessage: m.message, lastTime: m.created_at }
                : c);
            }
            return [{
              id: m.from_id, name: m.from_name, role: m.from_role,
              unreadCount: 1, lastMessage: m.message, lastTime: m.created_at,
            }, ...prev];
          });
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const handleMarkRead = (contactId: string) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, unreadCount: 0 } : c));
  };

  const totalUnread = contacts.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8 pb-0 h-[calc(100vh-73px)] flex flex-col">

          {/* Header */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-[#2D5A45]" />
              Messages
              {totalUnread > 0 && (
                <span className="text-sm font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">Messages from your transport team</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
            </div>
          ) : contacts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E3DB] p-10 text-center">
              <MessageCircle className="w-10 h-10 text-[#4A4A4A] mx-auto mb-3" />
              <p className="text-sm text-[#4A4A4A]">No messages yet.</p>
            </div>
          ) : (
            <div className="flex gap-0 flex-1 bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden min-h-0">
              {/* Contact list */}
              <div className="w-60 border-r border-[#E8E3DB] flex flex-col overflow-y-auto shrink-0">
                <div className="px-4 py-3 border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                  <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Conversations</p>
                </div>
                {contacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedContact(c); handleMarkRead(c.id); }}
                    className={`w-full text-left px-4 py-3 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB]/50 ${
                      selectedContact?.id === c.id ? 'bg-[#F5F0E8]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold text-sm shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm font-medium truncate ${
                            selectedContact?.id === c.id ? 'text-[#2D5A45]' : 'text-[#1A1A1A]'
                          }`}>{c.name}</p>
                          {c.unreadCount > 0 && (
                            <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full shrink-0 min-w-[18px] text-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        {c.role && (
                          <p className="text-xs text-[#4A4A4A] truncate">{ROLE_LABELS[c.role] ?? c.role}</p>
                        )}
                        {c.lastMessage && (
                          <p className="text-xs text-[#4A4A4A] truncate mt-0.5">{c.lastMessage}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Chat area */}
              <div className="flex-1 flex flex-col min-h-0">
                {selectedContact ? (
                  <>
                    {/* Chat header */}
                    <div className="px-5 py-3 border-b border-[#E8E3DB] bg-white flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold shrink-0">
                        {selectedContact.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-[#1A1A1A]">{selectedContact.name}</p>
                        {selectedContact.role && (
                          <p className="text-xs text-[#4A4A4A]">{ROLE_LABELS[selectedContact.role] ?? selectedContact.role}</p>
                        )}
                      </div>
                    </div>
                    {user && (
                      <ChatThread
                        contact={selectedContact}
                        currentUser={{ id: user.id, name: user.name, role: user.role }}
                        onMarkRead={() => handleMarkRead(selectedContact.id)}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#4A4A4A] text-sm">
                    Select a conversation
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
