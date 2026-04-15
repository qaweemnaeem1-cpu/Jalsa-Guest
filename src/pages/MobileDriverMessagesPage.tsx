import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name?: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface Conversation {
  partnerId: string;
  partnerName: string;
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPartnerId(msg: Message, userId: string) {
  return msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
}

function getPartnerName(msg: Message, userId: string) {
  if (msg.sender_id === userId) return msg.recipient_name ?? 'Transport';
  return msg.sender_name;
}

function fmtMsgTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function buildConversations(messages: Message[], userId: string): Conversation[] {
  const map = new Map<string, Conversation>();
  // Process oldest → newest so last message is correct
  for (const msg of messages) {
    const pid  = getPartnerId(msg, userId);
    const pname = getPartnerName(msg, userId);
    const isUnread = msg.recipient_id === userId && !msg.is_read;
    const existing = map.get(pid);
    if (existing) {
      // Update last message (messages are sorted asc, so last wins)
      existing.lastMessage = msg.body;
      existing.lastTime    = msg.created_at;
      if (isUnread) existing.unreadCount += 1;
    } else {
      map.set(pid, {
        partnerId:    pid,
        partnerName:  pname,
        lastMessage:  msg.body,
        lastTime:     msg.created_at,
        unreadCount:  isUnread ? 1 : 0,
      });
    }
  }
  // Sort by most recent
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
  );
}

// ── Conversation list item ────────────────────────────────────────────────────
function ConversationRow({
  conv,
  onPress,
}: {
  conv: Conversation;
  onPress: () => void;
}) {
  const initials = conv.partnerName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-gray-900 border-b border-[#F5F0E8] dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 transition-colors text-left"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full bg-[#2D5A45] flex items-center justify-center text-white font-bold text-base">
          {initials}
        </div>
        {conv.unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-900" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm font-semibold truncate max-w-[160px] ${conv.unreadCount > 0 ? 'text-[#1A1A1A] dark:text-white' : 'text-[#1A1A1A] dark:text-gray-200'}`}>
            {conv.partnerName}
          </span>
          <span className="text-[11px] text-[#4A4A4A] dark:text-gray-500 shrink-0 ml-2">
            {fmtMsgTime(conv.lastTime)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm truncate flex-1 ${conv.unreadCount > 0 ? 'text-[#1A1A1A] dark:text-gray-200 font-medium' : 'text-[#4A4A4A] dark:text-gray-400'}`}>
            {conv.lastMessage}
          </p>
          {conv.unreadCount > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-[#2D5A45] text-white text-[10px] font-bold">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────
function EmptyMessages() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <MessageSquare className="w-16 h-16 text-gray-200 dark:text-gray-700" />
      <p className="text-base font-semibold text-gray-400 dark:text-gray-500">No messages yet</p>
      <p className="text-sm text-gray-300 dark:text-gray-600 text-center px-8">
        Your transport head will reach out when needed
      </p>
    </div>
  );
}

// ── Full conversation view ────────────────────────────────────────────────────
function ConversationView({
  conv,
  allMessages,
  userId,
  userName,
  onSend,
  onBack,
}: {
  conv: Conversation;
  allMessages: Message[];
  userId: string;
  userName: string;
  onSend: (text: string, partnerId: string, partnerName: string) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft]   = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Messages for this conversation
  const thread = allMessages.filter(m =>
    (m.sender_id === userId && m.recipient_id === conv.partnerId) ||
    (m.recipient_id === userId && m.sender_id === conv.partnerId),
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Scroll to bottom on open + new messages
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [thread.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    await onSend(text, conv.partnerId, conv.partnerName);
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const initials = conv.partnerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // Group messages by date
  let lastDate = '';

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F0E8] dark:bg-gray-950 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800 flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#F5F0E8] dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#1A1A1A] dark:text-white" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#2D5A45] flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm truncate">{conv.partnerName}</p>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-[#4A4A4A] dark:text-gray-400">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {thread.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-[#4A4A4A] dark:text-gray-400">No messages yet. Say hello!</p>
          </div>
        ) : (
          thread.map(msg => {
            const isMine = msg.sender_id === userId;
            const msgDate = new Date(msg.created_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            const showDate = msgDate !== lastDate;
            lastDate = msgDate;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-[#E8E3DB] dark:bg-gray-800" />
                    <span className="text-[10px] text-[#4A4A4A] dark:text-gray-500 font-medium px-2">{msgDate}</span>
                    <div className="flex-1 h-px bg-[#E8E3DB] dark:bg-gray-800" />
                  </div>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isMine
                      ? 'bg-[#2D5A45] text-white rounded-tr-sm'
                      : 'bg-white dark:bg-gray-800 text-[#1A1A1A] dark:text-white border border-[#E8E3DB] dark:border-gray-700 rounded-tl-sm'
                  }`}>
                    <p className="text-sm leading-relaxed break-words">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60 text-right' : 'text-[#4A4A4A] dark:text-gray-500'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white dark:bg-gray-900 border-t border-[#E8E3DB] dark:border-gray-800 px-4 py-3 flex items-end gap-2 shrink-0">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-3 text-base text-[#1A1A1A] dark:text-white placeholder-[#9A9A9A] focus:outline-none max-h-32 overflow-y-auto leading-snug"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="w-10 h-10 rounded-full bg-[#2D5A45] flex items-center justify-center shrink-0 disabled:opacity-40 active:bg-[#234839] transition-colors"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverMessagesPage() {
  const { user } = useAuth();

  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

  // ── Fetch all messages for this driver ─────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('driver_messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`messages-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, (payload) => {
        const msg = payload.new as Message;
        // Only add if relevant to this driver
        if (msg.sender_id === user.id || msg.recipient_id === user.id) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Mark messages as read when opening a conversation
  const openConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    if (!user?.id) return;
    // Mark all incoming messages from this partner as read
    await supabase
      .from('driver_messages')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('sender_id', conv.partnerId)
      .eq('is_read', false);
    // Update local state
    setMessages(prev =>
      prev.map(m =>
        m.recipient_id === user.id && m.sender_id === conv.partnerId
          ? { ...m, is_read: true }
          : m,
      ),
    );
  };

  // ── Send a message ─────────────────────────────────────────────────────────
  const handleSend = async (text: string, partnerId: string, partnerName: string) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('driver_messages')
      .insert({
        sender_id:      user.id,
        sender_name:    user.name,
        recipient_id:   partnerId,
        recipient_name: partnerName,
        body:           text,
        is_read:        false,
      })
      .select()
      .single();
    if (data) {
      setMessages(prev => [...prev, data as Message]);
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const conversations = user?.id ? buildConversations(messages, user.id) : [];
  const totalUnread   = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  // ── Conversation view (full-screen overlay) ────────────────────────────────
  if (selectedConv && user) {
    return (
      <ConversationView
        conv={selectedConv}
        allMessages={messages}
        userId={user.id}
        userName={user.name}
        onSend={handleSend}
        onBack={() => setSelectedConv(null)}
      />
    );
  }

  // ── Conversation list view ─────────────────────────────────────────────────
  return (
    <MobileDriverLayout unreadMessages={totalUnread}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-white">Messages</h1>
        {totalUnread > 0 && (
          <p className="text-sm text-[#4A4A4A] dark:text-gray-400 mt-0.5">
            {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-[#4A4A4A] dark:text-gray-400 text-sm">
          Loading…
        </div>
      ) : conversations.length === 0 ? (
        <EmptyMessages />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl mx-4 mt-2 shadow-sm overflow-hidden border border-[#E8E3DB] dark:border-gray-800">
          {conversations.map(conv => (
            <ConversationRow
              key={conv.partnerId}
              conv={conv}
              onPress={() => openConversation(conv)}
            />
          ))}
        </div>
      )}
    </MobileDriverLayout>
  );
}
