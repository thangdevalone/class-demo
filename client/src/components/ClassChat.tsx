import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { classroomAPI } from '../services/api';

// Ermis SDK & React imports
import {
  Channel,
  ChatProvider,
  MessageInput,
  useChatClient,
  VirtualMessageList,
} from '@ermis-network/ermis-chat-react';
import { ErmisChat } from '@ermis-network/ermis-chat-sdk';

const API_KEY = import.meta.env.VITE_ERMIS_API_KEY || '';
const PROJECT_ID = import.meta.env.VITE_ERMIS_PROJECT_ID || '';
const BASE_URL = import.meta.env.VITE_ERMIS_BASE_URL || 'https://api.ermis.network';

// --- Mock Chat Components ---
function MockChat({ userName }: { userName: string }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-slate-50">
        <MessageSquare className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học (Demo)</span>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="text-center text-sm text-slate-500 my-4 bg-slate-50 p-2 rounded-lg">
          Đây là giao diện chat giả lập. Vui lòng cấu hình API key của Ermis Chat để dùng thật.
        </div>
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-700">{userName}</span>
            <div className="bg-slate-100 text-slate-800 p-2 rounded-lg text-sm mt-1 inline-block">
              Xin chào! 👋
            </div>
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex gap-2">
        <input 
          type="text" 
          placeholder="Nhập tin nhắn..." 
          className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          disabled
        />
        <Button size="sm" disabled>Gửi</Button>
      </div>
    </div>
  );
}

// Custom ActiveChannelSetter that resolves our custom logic
function ActiveChannelSetter({ channelId, channelType }: { channelId: string, channelType: string }) {
  const { client, setActiveChannel } = useChatClient();

  useEffect(() => {
    if (!client || !channelId || !channelType) return;
    
    let actualType = channelType;
    let actualId = channelId;
    
    if (channelId.includes(':')) {
      const firstColonIndex = channelId.indexOf(':');
      actualType = channelId.substring(0, firstColonIndex);
      actualId = channelId.substring(firstColonIndex + 1);
    }

    const channel = client.channel(actualType, actualId);
    setActiveChannel?.(channel);
    
    // Only set channel once per channelId/type change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, channelId, channelType]);

  return null;
}

interface ClassChatProps {
  classroomId: string;
  ermisChannelId?: string;
  ermisChannelType?: string;
  hideChat?: boolean;
}

export default function ClassChat({ classroomId, ermisChannelId, ermisChannelType, hideChat }: ClassChatProps) {
  const { user } = useAuth();
  const [chatReady, setChatReady] = useState(false);
  const [error, setError] = useState('');
  const [chatClient, setChatClient] = useState<ErmisChat | null>(null);

  useEffect(() => {
    if (!user?.ermisUserId || !user?.ermisToken || !API_KEY) {
      return;
    }

    let mounted = true;
    let localClient: any = null;

    const initChat = async () => {
      setError('');
      try {
        localClient = new ErmisChat(API_KEY, PROJECT_ID, BASE_URL);

        // Override getBatchUsers to fix SDK duplicate page parameter bug
        localClient.getBatchUsers = async (users: string[], page?: number, page_size?: number) => {
          const finalPage = page || 1;
          const finalPageSize = page_size || 10000;
          const usersResponse = await localClient.post(
            localClient.userBaseURL + '/users/batch',
            { users, project_id: localClient.projectId },
            { page: finalPage, page_size: finalPageSize }
          );
          
          if (localClient.userID) {
            (localClient as any)._upsertUsers(usersResponse.data);
          }
          return usersResponse.data || [];
        };

        if (localClient.userID !== user.ermisUserId) {
          if (localClient.userID) {
            await localClient.disconnectUser();
          }
          await localClient.connectUser(
            {
              id: user.ermisUserId,
              name: user.displayName || user.username,
              image: user.avatar,
            },
            user.ermisToken
          );
        }

        if (mounted) {
          setChatClient(localClient);
          setChatReady(true);
        }
      } catch (err: any) {
        console.error('Failed to init ermis chat:', err);
        if (mounted) setError('Lỗi kết nối server chat');
      }
    };

    initChat();

    return () => {
      mounted = false;
      setChatReady(false);
      if (localClient) {
        localClient.disconnectUser();
      }
    };
  }, [user?.ermisUserId, user?.ermisToken, user?.displayName, user?.username, user?.avatar]);

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

  if (!chatReady || !chatClient || !ermisChannelId) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-50 text-slate-500 ${hideChat ? 'hidden' : 'h-full flex-1'}`}>
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        <span className="mt-2 text-sm font-medium">Đang kết nối...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-white ermis-chat-light ${hideChat ? 'hidden' : 'h-full flex-1'}`}>
      <ChatProvider client={chatClient as any} initialTheme="light">
        <ActiveChannelSetter channelId={ermisChannelId} channelType={ermisChannelType || 'messaging'} />
        <Channel 
          className="flex h-full flex-col w-full"
          EmptyStateIndicator={() => (
            <div className="flex h-full items-center justify-center bg-slate-50">
              <span className="text-sm text-slate-400">Chưa có tin nhắn nào.</span>
            </div>
          )}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 p-3 bg-slate-50 shrink-0">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chat lớp học</span>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col relative [&_.ermis-channel]:h-full [&_.ermis-channel]:bg-transparent [&_.ermis-message-list]:flex-1 [&_.ermis-message-list]:flex [&_.ermis-message-list]:flex-col [&_.ermis-message-list]:overflow-hidden [&_.ermis-message-list__vlist]:flex-1 [&_.ermis-message-list__vlist]:overflow-y-auto">
            <VirtualMessageList includeHiddenMessages={false} />
          </div>
          <div className="relative shrink-0 border-t border-slate-200 bg-slate-50 p-2">
            <MessageInput 
              placeholder="Nhập tin nhắn..." 
              disableStickers={true}
              VoiceRecordButtonComponent={() => null}
            />
          </div>
        </Channel>
      </ChatProvider>
    </div>
  );
}
