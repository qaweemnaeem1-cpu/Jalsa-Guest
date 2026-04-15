import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export default function MobileDriverMessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('driver_messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
    setLoading(false);

    // Mark incoming as read
    await supabase
      .from('driver_messages')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
  }, [user?.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`messages-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchMessages]);

  const handleSend = async () => {
    if (!draft.trim() || !user?.id) return;
    setSending(true);
    await supabase.from('driver_messages').insert({
      sender_id: user.id,
      sender_name: user.name,
      // Sends to transport coordinator — placeholder recipient
      recipient_id: 'coordinator',
      body: draft.trim(),
      is_read: false,
    });
    setDraft('');
    setSending(false);
    fetchMessages();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <MobileDriverLayout>
      <div className="flex flex-col h-full">
        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[#4A4A4A] dark:text-gray-400 text-sm">
              Loading…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <MessageSquare className="w-10 h-10 text-gray-200 dark:text-gray-700" />
              <p className="text-sm text-[#4A4A4A] dark:text-gray-400">No messages yet</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                    isMine
                      ? 'bg-[#2D5A45] text-white rounded-br-sm'
                      : 'bg-white dark:bg-gray-800 text-[#1A1A1A] dark:text-white border border-[#E8E3DB] dark:border-gray-700 rounded-bl-sm'
                  }`}>
                    {!isMine && (
                      <p className="text-xs font-semibold text-[#2D5A45] dark:text-emerald-400 mb-0.5">
                        {msg.sender_name}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-[#4A4A4A] dark:text-gray-500'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-[#E8E3DB] dark:border-gray-800 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[#D4CFC7] dark:border-gray-700 bg-[#F5F0E8] dark:bg-gray-800 text-[#1A1A1A] dark:text-white placeholder-[#9A9A9A] px-4 py-2.5 text-sm focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20 max-h-32 overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="w-10 h-10 rounded-xl bg-[#2D5A45] flex items-center justify-center shrink-0 disabled:opacity-40 active:bg-[#234839]"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </MobileDriverLayout>
  );
}
