import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, AlertTriangle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Ermis SDK & React imports — these come from the local monorepo via file: protocol
import { ErmisChat } from '@ermis-network/ermis-chat-sdk';
import {
  ChatProvider,
  Channel,
  ChannelHeader,
  VirtualMessageList,
  MessageInput,
  ErmisCallProvider,
  ErmisCallUI,
  useChatClient,
} from '@ermis-network/ermis-chat-react';

interface ClassChatProps {
  classroomId: string;
  ermisChannelId: string;
  ermisChannelType: string;
}

const API_KEY = import.meta.env.VITE_ERMIS_API_KEY || '';
const PROJECT_ID = import.meta.env.VITE_ERMIS_PROJECT_ID || '';
const BASE_URL = import.meta.env.VITE_ERMIS_BASE_URL || 'https://api.ermis.network';

// --- Mock Chat Components ---
const MockChat = ({ userName }: { userName: string }) => {
  const [messages, setMessages] = useState<{ id: string; text: string; sender: string; time: string; isMe: boolean }[]>([
    { id: '1', text: 'Chào mọi người, lớp học chuẩn bị bắt đầu nhé!', sender: 'Giáo viên', time: new Date(Date.now() - 300000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isMe: false }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: input.trim(),
      sender: userName,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true
    }]);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-white shrink-0">
        <MessageSquare className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học (Giả lập)</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.isMe ? 'self-end items-end' : 'self-start items-start'}`}>
            <span className="text-[10px] text-slate-500 mb-1 px-1">{msg.isMe ? 'Bạn' : msg.sender} • {msg.time}</span>
            <div className={`px-3 py-2 rounded-2xl text-sm ${msg.isMe ? 'bg-blue-500 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Nhập tin nhắn..." 
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

const ActiveChannelSetter = ({ channelId, channelType }: { channelId: string; channelType: string }) => {
  const { client, setActiveChannel } = useChatClient();
  
  useEffect(() => {
    if (channelId && client) {
      const channel = client.channel(channelType || 'team', channelId);
      channel.watch().then(() => {
        setActiveChannel?.(channel);
      });
    }
  }, [channelId, channelType, client, setActiveChannel]);
  
  return null;
};

export default function ClassChat({ classroomId, ermisChannelId, ermisChannelType }: ClassChatProps) {
  const { user } = useAuth();
  const [chatReady, setChatReady] = useState(false);
  const [error, setError] = useState('');
  const [chatClient, setChatClient] = useState<any>(null);

  // Initialize Ermis Chat client
  useEffect(() => {
    if (!user?.ermisUserId || !user?.ermisToken || !API_KEY) {
      // Skipping real connection when credentials missing to show MockChat
      return;
    }

    let mounted = true;
    const initChat = async () => {
      try {
        const client = ErmisChat.getInstance(API_KEY, PROJECT_ID, BASE_URL);
        await client.connectUser({ id: user.ermisUserId! }, user.ermisToken!);
        
        if (!mounted) return;
        setChatClient(client);
        
        // Set active channel if ermisChannelId is provided
        if (ermisChannelId) {
          const channel = client.channel(ermisChannelType || 'team', ermisChannelId);
          await channel.watch();
          try {
            await channel.addMembers([user.ermisUserId!]);
          } catch (e) {
            console.log('User already a member or no permission to add members', e);
          }
          // Active channel will be set by ActiveChannelSetter component
        }

        setChatReady(true);
      } catch (err: any) {
        console.error('Lỗi kết nối Ermis Chat:', err);
        if (mounted) setError('Không thể kết nối đến máy chủ Chat.');
      }
    };

    initChat();

    return () => {
      mounted = false;
      if (chatClient) {
        chatClient.disconnectUser();
      }
    };
  }, [user, ermisChannelId, ermisChannelType]);

  // Handle DM Call triggered from RaiseHand (Teacher accepting a student)
  useEffect(() => {
    if (!chatClient || !user?.ermisUserId) return;

    const handleStartCall = async (e: any) => {
      const studentErmisId = e.detail?.studentErmisId;
      if (!studentErmisId) return;

      try {
        const callId = crypto.randomUUID();
        const call = chatClient.call('default', callId);
        await call.getOrCreate({ 
          ring: true, 
          members: [user.ermisUserId, studentErmisId] 
        });
        console.log('Initiated DM call with', studentErmisId);
      } catch (err) {
        console.error('Lỗi khi khởi tạo cuộc gọi:', err);
      }
    };

    window.addEventListener('start_dm_call', handleStartCall);
    return () => window.removeEventListener('start_dm_call', handleStartCall);
  }, [chatClient, user?.ermisUserId]);

  // Call session ID for ErmisCallProvider
  const callSessionId = useMemo(() => {
    const key = `class-demo-call-session-${user?.id || ''}`;
    let saved = localStorage.getItem(key);
    if (!saved) {
      saved = crypto.randomUUID();
      localStorage.setItem(key, saved);
    }
    return saved;
  }, [user?.id]);

  // Fallback to Mock Chat when Ermis is not configured
  if (!API_KEY || !user?.ermisUserId || !user?.ermisToken) {
    return <MockChat userName={user?.displayName || 'User'} />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-slate-50">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-red-500">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!chatReady || !chatClient) {
    return (
      <div className="flex h-full flex-col bg-slate-50">
        <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-white">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <p className="text-xs font-medium">Đang kết nối chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white ermis-chat-light">
      <ChatProvider client={chatClient} initialTheme="light">
        <ActiveChannelSetter channelId={ermisChannelId} channelType={ermisChannelType} />
        <ErmisCallProvider client={chatClient} sessionId={callSessionId}>
          <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-slate-50">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học</span>
          </div>

          <div className="flex-1 overflow-hidden relative [&_.str-chat]:h-full [&_.str-chat]:bg-transparent [&_.str-chat__main-panel]:bg-transparent [&_.str-chat__list]:bg-transparent">
            <Channel>
              <div className="flex h-full flex-col">
                <div className="flex-1 overflow-y-auto">
                  <VirtualMessageList />
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-2">
                  <MessageInput placeholder="Nhập tin nhắn..." />
                </div>
              </div>
            </Channel>
          </div>

          {/* Call UI overlay — automatically shows on incoming/outgoing calls */}
          <ErmisCallUI />
        </ErmisCallProvider>
      </ChatProvider>
    </div>
  );
}
