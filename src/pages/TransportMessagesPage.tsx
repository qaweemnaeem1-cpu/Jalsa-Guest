/**
 * /transport/messages — Messages for Transport Department Head.
 * Shows driver communication threads.
 */
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import type { DriverMessage } from '@/components/DriverMessagesDialog';
import { formatTimestampTime, formatTimestampDateShort } from '@/utils/dateHelpers';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtTime = (iso: string) => formatTimestampTime(iso);
const fmtDate = (iso: string) => formatTimestampDateShort(iso);

// ── types ─────────────────────────────────────────────────────────────────────

interface DriverRow {
  id: string;
  name: string;
  is_available?: boolean;
  vehicle_type?: string;
  vehicle_model?: string;
  unreadCount?: number;
}

// ── Chat Thread ───────────────────────────────────────────────────────────────

function ChatThread({ driver, currentUser }: {
  driver: DriverRow;
  currentUser: { id: string; name: string; role: string };
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

    supabase
      .from('driver_messages')
      .select('*')
      .or(`and(from_id.eq.${currentUser.id},to_driver_id.eq.${driver.id}),and(from_id.eq.${driver.id},to_driver_id.eq.${currentUser.id})`)
      .order('created_at')
      .then(({ data }) => {
        setMessages((data as DriverMessage[]) ?? []);
        setLoading(false);
        // Mark unread
        supabase.from('driver_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('to_driver_id', currentUser.id)
          .eq('from_id', driver.id)
          .eq('is_read', false)
          .then(() => {});
      });

    // Subscribe
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`transport-chat-${driver.id}-${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, payload => {
        const msg = payload.new as DriverMessage;
        const relevant =
          (msg.from_id === currentUser.id && msg.to_driver_id === driver.id) ||
          (msg.from_id === driver.id && msg.to_driver_id === currentUser.id);
        if (relevant) {
          setMessages(prev => [...prev, msg]);
          if (msg.from_id === driver.id) {
            supabase.from('driver_messages')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', msg.id)
              .then(() => {});
          }
        }
      })
      .subscribe();

    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.id, currentUser.id]);

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
        from_id:       currentUser.id,
        from_name:     currentUser.name,
        from_role:     currentUser.role,
        to_driver_id:  driver.id,
        to_driver_name: driver.name,
        message:       msg,
        is_read:       false,
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
      {/* Messages */}
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
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? 'bg-[#2D5A45] text-white rounded-tr-sm' : 'bg-white border border-[#E8E3DB] text-[#1A1A1A] rounded-tl-sm'}`}>
                    {!isMe && (
                      <p className="text-[10px] font-semibold text-[#4A4A4A] mb-0.5">{m.from_name}</p>
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
          placeholder={`Message ${driver.name}…`}
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TransportMessagesPage() {
  const { user } = useAuth();

  const [drivers, setDrivers]             = useState<DriverRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null);

  const loadedRef  = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;

    supabase
      .from('users')
      .select('id,name,is_available,vehicle_type,vehicle_model')
      .eq('role', 'driver')
      .eq('transport_department_id', user.transportDepartmentId)
      .order('name')
      .then(async ({ data }) => {
        const rows = (data ?? []) as DriverRow[];
        // Fetch unread counts per driver
        if (rows.length > 0 && user?.id) {
          const { data: unread } = await supabase
            .from('driver_messages')
            .select('from_id')
            .eq('to_driver_id', user.id)
            .eq('is_read', false);
          const countMap: Record<string, number> = {};
          for (const m of (unread ?? []) as { from_id: string }[]) {
            countMap[m.from_id] = (countMap[m.from_id] ?? 0) + 1;
          }
          rows.forEach(r => { r.unreadCount = countMap[r.id] ?? 0; });
        }
        setDrivers(rows);
        if (rows.length > 0) setSelectedDriver(rows[0]);
        setLoading(false);
      });
  }, [user?.transportDepartmentId]);

  // ── real-time: track unread counts and show toasts for new incoming msgs ──
  useEffect(() => {
    if (!user?.id) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel('transport-messages-incoming')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `to_driver_id=eq.${user.id}` },
        payload => {
          const msg = payload.new as { from_id: string; from_name: string; is_read: boolean };
          if (msg.is_read) return;
          // Update unread count for the sender
          setDrivers(prev => prev.map(d =>
            d.id === msg.from_id
              ? { ...d, unreadCount: (d.unreadCount ?? 0) + 1 }
              : d
          ));
          // Toast only if chat with this driver is not currently open
          setSelectedDriver(cur => {
            if (!cur || cur.id !== msg.from_id) {
              toast(`💬 New message from ${msg.from_name}`);
            }
            return cur;
          });
        }
      )
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [user?.id]);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8 pb-0 h-[calc(100vh-73px)] flex flex-col">

          {/* Header */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-[#2D5A45]" />
              Messages
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">Communicate with your drivers</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
            </div>
          ) : drivers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E3DB] p-10 text-center">
              <Users className="w-10 h-10 text-[#4A4A4A] mx-auto mb-3" />
              <p className="text-sm text-[#4A4A4A]">No drivers in your department yet.</p>
            </div>
          ) : (
            <div className="flex gap-0 flex-1 bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden min-h-0">
              {/* Driver list */}
              <div className="w-56 border-r border-[#E8E3DB] flex flex-col overflow-y-auto shrink-0">
                <div className="px-4 py-3 border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                  <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Drivers</p>
                </div>
                {drivers.map(d => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDriver(d);
                      // Clear unread badge locally
                      setDrivers(prev => prev.map(dr => dr.id === d.id ? { ...dr, unreadCount: 0 } : dr));
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB]/50 ${selectedDriver?.id === d.id ? 'bg-[#F5F0E8]' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold text-sm">
                          {d.name.charAt(0)}
                        </div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          d.is_available ? 'bg-green-500' : 'bg-red-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm font-medium truncate ${selectedDriver?.id === d.id ? 'text-[#2D5A45]' : 'text-[#1A1A1A]'}`}>
                            {d.name}
                          </p>
                          {(d.unreadCount ?? 0) > 0 && (
                            <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full shrink-0 min-w-[18px] text-center">
                              {d.unreadCount}
                            </span>
                          )}
                        </div>
                        {(d.vehicle_type || d.vehicle_model) && (
                          <p className="text-xs text-[#4A4A4A] truncate">{[d.vehicle_type, d.vehicle_model].filter(Boolean).join(' ')}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Chat area */}
              <div className="flex-1 flex flex-col min-h-0">
                {selectedDriver ? (
                  <>
                    {/* Chat header */}
                    <div className="px-5 py-3 border-b border-[#E8E3DB] bg-white flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold shrink-0">
                        {selectedDriver.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-[#1A1A1A]">{selectedDriver.name}</p>
                        <p className="text-xs text-[#4A4A4A]">
                          {selectedDriver.is_available ? '🟢 Available' : '🔴 Off Duty'}
                          {selectedDriver.vehicle_type ? ` · ${selectedDriver.vehicle_type}` : ''}
                        </p>
                      </div>
                    </div>
                    {user && (
                      <ChatThread
                        driver={selectedDriver}
                        currentUser={{ id: user.id, name: user.name, role: user.role }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#4A4A4A] text-sm">
                    Select a driver to start chatting
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
