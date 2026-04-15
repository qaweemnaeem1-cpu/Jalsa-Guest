import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Plus, X, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface Conversation {
  partnerId: string;
  partnerName: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

interface Driver {
  id: string;
  name: string;
}

function buildConversations(messages: Message[], myId: string): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const m of messages) {
    const isMe = m.sender_id === myId;
    const partnerId = isMe ? m.recipient_id : m.sender_id;
    const partnerName = isMe ? m.recipient_name : m.sender_name;
    const existing = map.get(partnerId);
    const unreadDelta = !isMe && !m.is_read ? 1 : 0;
    if (!existing || m.created_at > existing.lastTime) {
      map.set(partnerId, {
        partnerId,
        partnerName,
        lastMessage: m.body,
        lastTime: m.created_at,
        unread: (existing?.unread ?? 0) + unreadDelta,
      });
    } else {
      map.set(partnerId, { ...existing, unread: existing.unread + unreadDelta });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime));
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateSep(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function MobileTransportMessagesPage() {
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showNewConv, setShowNewConv] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function fetchMessages() {
    const { data } = await supabase.from('driver_messages').select('*').or(`sender_id.eq.${myId},recipient_id.eq.${myId}`).order('created_at', { ascending: true });
    const msgs = (data ?? []) as Message[];
    setMessages(msgs);
    setConversations(buildConversations(msgs, myId));
  }

  async function fetchDrivers() {
    if (!deptId) return;
    const { data } = await supabase.from('users').select('id,name').eq('transport_department_id', deptId).eq('role', 'driver').eq('is_head_driver', false);
    setDrivers((data ?? []) as Driver[]);
  }

  useEffect(() => {
    void fetchMessages();
    void fetchDrivers();
  }, [myId, deptId]);

  // Real-time subscription
  useEffect(() => {
    const ch = supabase.channel('transport-msgs').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'driver_messages',
      filter: `recipient_id=eq.${myId}`,
    }, (payload) => {
      const msg = payload.new as Message;
      setMessages(prev => {
        const updated = [...prev, msg];
        setConversations(buildConversations(updated, myId));
        if (activeConv?.partnerId === msg.sender_id) {
          setActiveMessages(am => [...am, msg]);
          void supabase.from('driver_messages').update({ is_read: true }).eq('id', msg.id);
        }
        return updated;
      });
    }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [myId, activeConv]);

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    const msgs = messages.filter(m =>
      (m.sender_id === myId && m.recipient_id === conv.partnerId) ||
      (m.sender_id === conv.partnerId && m.recipient_id === myId)
    ).sort((a, b) => a.created_at.localeCompare(b.created_at));
    setActiveMessages(msgs);
    // Mark unread as read
    const unreadIds = msgs.filter(m => m.recipient_id === myId && !m.is_read).map(m => m.id);
    if (unreadIds.length > 0) {
      void supabase.from('driver_messages').update({ is_read: true }).in('id', unreadIds);
    }
  }

  function startNewConversation(driver: Driver) {
    const conv: Conversation = { partnerId: driver.id, partnerName: driver.name, lastMessage: '', lastTime: '', unread: 0 };
    setShowNewConv(false);
    openConversation(conv);
  }

  async function sendMessage() {
    if (!text.trim() || !activeConv) return;
    setSending(true);
    const body = text.trim();
    setText('');
    try {
      const { data, error } = await supabase.from('driver_messages').insert({
        sender_id: myId,
        sender_name: user?.name ?? '',
        recipient_id: activeConv.partnerId,
        recipient_name: activeConv.partnerName,
        body,
        is_read: false,
      }).select().single();
      if (error) throw error;
      const newMsg = data as Message;
      setActiveMessages(prev => [...prev, newMsg]);
      setMessages(prev => {
        const updated = [...prev, newMsg];
        setConversations(buildConversations(updated, myId));
        return updated;
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  // ── Full-screen chat view ──
  if (activeConv) {
    let lastDateLabel = '';
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#F5F0E8] dark:bg-gray-950" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#2D5A45] dark:bg-gray-900">
          <button onClick={() => setActiveConv(null)}>
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-900 flex items-center justify-center text-xs font-semibold text-[#2D5A45] dark:text-emerald-300 shrink-0">
            {activeConv.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{activeConv.partnerName}</div>
            <div className="text-xs text-white/60">Driver</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {activeMessages.map(m => {
            const dateLabel = fmtDateSep(m.created_at);
            const showSep = dateLabel !== lastDateLabel;
            if (showSep) lastDateLabel = dateLabel;
            const isMe = m.sender_id === myId;
            return (
              <div key={m.id}>
                {showSep && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-[#E8E3DB] dark:bg-gray-700" />
                    <span className="text-[10px] text-[#4A4A4A] dark:text-gray-500 font-medium px-2">{dateLabel}</span>
                    <div className="flex-1 h-px bg-[#E8E3DB] dark:bg-gray-700" />
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-[#2D5A45] text-white rounded-br-sm'
                      : 'bg-white dark:bg-gray-800 text-[#1A1A1A] dark:text-gray-100 rounded-bl-sm border border-[#E8E3DB] dark:border-gray-700'
                  }`}>
                    {m.body}
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-white/60' : 'text-[#4A4A4A] dark:text-gray-500'}`}>
                      {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="flex items-end gap-2 px-4 py-3 bg-white dark:bg-gray-900 border-t border-[#E8E3DB] dark:border-gray-800" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <textarea
            className="flex-1 resize-none px-3 py-2 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-[#F5F0E8] dark:bg-gray-800 text-sm text-[#1A1A1A] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2D5A45] max-h-28"
            rows={1}
            placeholder="Type a message…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
          />
          <button
            disabled={!text.trim() || sending}
            onClick={sendMessage}
            className="w-9 h-9 rounded-full bg-[#2D5A45] flex items-center justify-center disabled:opacity-40 active:bg-[#234839] shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <MobileTransportHeadLayout unreadMessages={totalUnread}>
      <div className="px-4 pt-4 pb-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-gray-100">Messages</h1>
          <button
            onClick={() => setShowNewConv(true)}
            className="flex items-center gap-1.5 bg-[#2D5A45] text-white text-sm font-medium px-3 py-2 rounded-xl active:bg-[#234839]"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>

        {/* Conversation list */}
        {conversations.length === 0 ? (
          <div className="text-center py-16 text-[#4A4A4A] dark:text-gray-500 text-sm">
            No conversations yet. Start one with a driver.
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map(c => (
              <button
                key={c.partnerId}
                onClick={() => openConversation(c)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 active:bg-[#F5F0E8] dark:active:bg-gray-700 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 shrink-0">
                  {c.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1A1A1A] dark:text-gray-100 truncate">{c.partnerName}</span>
                    <span className="text-[10px] text-[#4A4A4A] dark:text-gray-500 shrink-0 ml-2">{fmtTime(c.lastTime)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-[#4A4A4A] dark:text-gray-400 truncate">{c.lastMessage}</span>
                    {c.unread > 0 && (
                      <span className="ml-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#2D5A45] text-white text-[10px] font-bold px-1 shrink-0">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New conversation sheet */}
      {showNewConv && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewConv(false)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-3"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Message a Driver</h3>
              <button onClick={() => setShowNewConv(false)}>
                <X className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" />
              </button>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {drivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => startNewConversation(d)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F5F0E8] dark:bg-gray-800 active:bg-[#E8E3DB] dark:active:bg-gray-700 border border-[#E8E3DB] dark:border-gray-700"
                >
                  <div className="w-8 h-8 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-xs font-semibold text-[#2D5A45] dark:text-emerald-400">
                    {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100 flex-1 text-left">{d.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
              {drivers.length === 0 && (
                <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-500 py-4">No drivers in this department</p>
              )}
            </div>
          </div>
        </div>
      )}
    </MobileTransportHeadLayout>
  );
}
