import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, MessageSquare, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import RaiseHand from './RaiseHand';

// Ermis SDK & React imports
import {
  Channel,
  ChatProvider,
  MessageInput,
  useCallContext,
  useChatClient,
  VirtualMessageList,
} from '@ermis-network/ermis-chat-react';
import { CallStatus, ErmisChat } from '@ermis-network/ermis-chat-sdk';

const API_KEY = import.meta.env.VITE_ERMIS_API_KEY || '';
const PROJECT_ID = import.meta.env.VITE_ERMIS_PROJECT_ID || '';
const BASE_URL = import.meta.env.VITE_ERMIS_BASE_URL || 'https://api.ermis.network';
const CALL_PRIVACY_VALUE = 'everyone';
const CALL_USER_NAME_KEY = 'class-demo-ermis-user-name:';

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

function isInviteRequiredError(err: any) {
  const code = err?.response?.data?.ermis_code || err?.ermis_code;
  const message = String(err?.response?.data?.message || err?.message || '').toLowerCase();
  return code === 9 || message.includes('accept invite');
}

function getCurrentMembership(channel: any) {
  const userId = channel?.getClient?.()?.userID;
  return channel?.state?.membership || (userId ? channel?.state?.members?.[userId] : undefined);
}

function isInactiveChannelRole(role?: string) {
  return role === 'pending' || role === 'skipped' || role === 'rejected';
}

function markChannelMembershipAccepted(channel: any) {
  const userId = channel?.getClient?.()?.userID;
  if (!channel?.state || !userId) return;

  const currentMembership = channel.state.membership || channel.state.members?.[userId] || { user_id: userId };
  const acceptedMembership = {
    ...currentMembership,
    user_id: currentMembership.user_id || userId,
    channel_role: 'member',
  };

  channel.state.membership = acceptedMembership;
  channel.state.members = {
    ...(channel.state.members || {}),
    [userId]: {
      ...(channel.state.members?.[userId] || {}),
      ...acceptedMembership,
      user: channel.getClient?.().user || channel.state.members?.[userId]?.user,
    },
  };
}

async function watchClassChannel(channel: any) {
  await channel.watch({ messages: { limit: 25, include_hidden_messages: true } });
}

async function acceptChannelInviteIfNeeded(channel: any) {
  let needsAccept = false;

  try {
    await watchClassChannel(channel);
    needsAccept = isInactiveChannelRole(getCurrentMembership(channel)?.channel_role);
  } catch (err) {
    if (!isInviteRequiredError(err)) throw err;
    needsAccept = true;
  }

  if (!needsAccept) {
    markChannelMembershipAccepted(channel);
    return;
  }

  const actions: Array<'accept' | 'join'> = ['accept', 'join'];
  let lastError: any = null;

  for (const action of actions) {
    try {
      await channel.acceptInvite(action);
      await watchClassChannel(channel);
      markChannelMembershipAccepted(channel);
      return;
    } catch (err: any) {
      lastError = err;
      const message = String(err?.response?.data?.message || err?.message || '').toLowerCase();
      if (message.includes('already') || message.includes('accepted') || message.includes('joined')) {
        await watchClassChannel(channel).catch(() => undefined);
        markChannelMembershipAccepted(channel);
        return;
      }
    }
  }

  markChannelMembershipAccepted(channel);
  if (lastError) console.warn('Class channel invite accepted locally after API fallback:', lastError);
}

// Custom ActiveChannelSetter that resolves our custom logic
function ActiveChannelSetter({ channelId, channelType }: { channelId: string, channelType: string }) {
  const { client, setActiveChannel } = useChatClient();

  useEffect(() => {
    if (!client || !channelId || !channelType) return;
    
    let actualType = channelType;
    let actualId = channelId;
    let cancelled = false;
    
    if (channelId.includes(':')) {
      const firstColonIndex = channelId.indexOf(':');
      actualType = channelId.substring(0, firstColonIndex);
      actualId = channelId.substring(firstColonIndex + 1);
    }

    const channel = client.channel(actualType, actualId);
    acceptChannelInviteIfNeeded(channel)
      .catch((err) => console.error('Auto accept class channel invite error:', err))
      .finally(() => {
        if (!cancelled) setActiveChannel?.(channel);
      });
    
    return () => {
      cancelled = true;
    };
  }, [client, channelId, channelType, setActiveChannel]);

  return null;
}

interface ClassUserProfileSource {
  _id?: string;
  displayName?: string;
  username?: string;
  ermisUserId?: string;
  avatar?: string;
}

interface ClassChatProps {
  classroomId: string;
  ermisChannelId?: string;
  ermisChannelType?: string;
  hideChat?: boolean;
  isTeacher: boolean;
  teacher: ClassUserProfileSource;
  students?: ClassUserProfileSource[];
}

function getUserSettingsUrl() {
  const base = BASE_URL.replace(/\/+$/, '');
  return `${base}/users/settings`;
}

function getCallPrivacy(settings: any) {
  return (
    settings?.call_privacy ||
    settings?.data?.call_privacy ||
    settings?.settings?.call_privacy ||
    settings?.user_settings?.call_privacy ||
    settings?.userSettings?.call_privacy
  );
}

async function requestUserSettings(token: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const response = await fetch(getUserSettingsUrl(), {
    method,
    headers: {
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed with ${response.status}`);
  }

  return data;
}

async function ensureCallPrivacyEveryone(token: string) {
  try {
    const settings = await requestUserSettings(token, 'GET');
    if (getCallPrivacy(settings) !== CALL_PRIVACY_VALUE) {
      await requestUserSettings(token, 'POST', { call_privacy: CALL_PRIVACY_VALUE });
    }
  } catch (err) {
    console.warn('Failed to ensure call privacy setting:', err);
  }
}

function getCallSessionId(userId?: string) {
  const key = `class-demo-call-session-id-${userId || 'anonymous'}`;
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function rememberCallUserName(userId?: string, name?: string) {
  if (!userId || !name || name === userId) return;
  try {
    localStorage.setItem(`${CALL_USER_NAME_KEY}${userId}`, name);
  } catch {
    // Ignore storage errors; SDK user cache can still provide a display name.
  }
}

function getRememberedCallUserName(userId?: string) {
  if (!userId) return '';
  try {
    return localStorage.getItem(`${CALL_USER_NAME_KEY}${userId}`) || '';
  } catch {
    return '';
  }
}

function getDisplayNameFromUser(user: any) {
  return user?.name || user?.displayName || user?.fullName || user?.username || user?.id;
}

function toErmisDisplayUser(source?: ClassUserProfileSource | null) {
  const id = source?.ermisUserId;
  if (!id) return null;
  const name = source.displayName || source.username || id;
  return {
    id,
    name,
    display_name: name,
    username: source.username,
    avatar: source.avatar,
    avatar_url: source.avatar,
    image: source.avatar,
  };
}

function buildKnownClassUsers(currentUser: any, teacher?: ClassUserProfileSource, students: ClassUserProfileSource[] = []) {
  const users = [
    toErmisDisplayUser(currentUser),
    toErmisDisplayUser(teacher),
    ...students.map(toErmisDisplayUser),
  ].filter(Boolean) as any[];
  const byId = new Map<string, any>();

  for (const user of users) {
    const existing = byId.get(user.id) || {};
    byId.set(user.id, { ...existing, ...user, id: user.id });
  }

  return Array.from(byId.values());
}

function mergeKnownUserProfiles(users: any[] = [], knownUsersById: Record<string, any>) {
  const mergedById = new Map<string, any>();

  for (const user of users) {
    if (!user?.id) continue;
    mergedById.set(user.id, { ...user, ...(knownUsersById[user.id] || {}) });
  }

  for (const knownUser of Object.values(knownUsersById)) {
    if (!knownUser?.id || mergedById.has(knownUser.id)) continue;
    mergedById.set(knownUser.id, knownUser);
  }

  return Array.from(mergedById.values());
}

function ClassChatUserHydrator({ users }: { users: any[] }) {
  const { client, activeChannel, syncMessages } = useChatClient();
  const signature = useMemo(() => users.map((item) => `${item.id}:${item.name}:${item.avatar || ''}`).join('|'), [users]);

  useEffect(() => {
    if (!client || users.length === 0) return;

    const applyUsers = () => {
      (client as any)._upsertUsers?.(users);
      for (const user of users) {
        activeChannel?.state?.updateUserMessages?.(user);
      }
      syncMessages?.();
    };

    applyUsers();
    const timers = [window.setTimeout(applyUsers, 300), window.setTimeout(applyUsers, 1200)];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeChannel, client, signature, syncMessages, users]);

  return null;
}
function resolveCallPeerName(client: any, callNode: any, peerInfo?: { id?: string; name?: string }) {
  const peerId = peerInfo?.id || '';
  const sdkName = peerInfo?.name || '';
  if (sdkName && sdkName !== peerId) return sdkName;

  const rememberedName = getRememberedCallUserName(peerId);
  if (rememberedName && rememberedName !== peerId) return rememberedName;

  const cachedUser = peerId ? client?.state?.users?.[peerId] : undefined;
  const cachedName = getDisplayNameFromUser(cachedUser);
  if (cachedName && cachedName !== peerId) return cachedName;

  const cid = callNode?.cid || '';
  const channel = cid ? client?.activeChannels?.[cid] : undefined;
  const stateMember = peerId ? channel?.state?.members?.[peerId] : undefined;
  const stateName = getDisplayNameFromUser(stateMember?.user);
  if (stateName && stateName !== peerId) return stateName;

  const dataMembers = channel?.data?.members || [];
  const dataMember = dataMembers.find((member: any) => member?.user_id === peerId || member?.user?.id === peerId);
  const dataName = getDisplayNameFromUser(dataMember?.user || dataMember);
  if (dataName && dataName !== peerId) return dataName;

  return sdkName || peerId || 'Nguoi dung';
}
function ClassCallUI() {
  const {
    callStatus,
    callType,
    callerInfo,
    receiverInfo,
    isIncoming,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    isMicMuted,
    errorMessage,
    clearError,
    resetCall,
    callDuration,
    callNode,
  } = useCallContext();
  const { client } = useChatClient();

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const acceptTimeoutRef = useRef<number | null>(null);
  const acceptingRef = useRef(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptReady, setAcceptReady] = useState(false);
  const [callNotice, setCallNotice] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (callStatus !== CallStatus.RINGING && callStatus !== CallStatus.PREPARING) {
      acceptingRef.current = false;
      setAccepting(false);
      setRejecting(false);
    }
    if (callStatus === CallStatus.CONNECTED && acceptTimeoutRef.current) {
      window.clearTimeout(acceptTimeoutRef.current);
      acceptTimeoutRef.current = null;
      acceptingRef.current = false;
      setAccepting(false);
      setCallNotice('');
    }
    if (callStatus !== CallStatus.CONNECTED) {
      setEnding(false);
    }
  }, [callStatus]);

  useEffect(() => {
    if (isIncoming && (callStatus === CallStatus.RINGING || callStatus === CallStatus.PREPARING)) {
      setAcceptReady(false);
      setCallNotice('Dang chuan bi ket noi...');
      const timer = window.setTimeout(() => {
        setAcceptReady(true);
        setCallNotice('');
      }, 900);

      return () => window.clearTimeout(timer);
    }

    setAcceptReady(false);
    if (callStatus !== CallStatus.PREPARING) {
      setCallNotice('');
    }
  }, [callStatus, isIncoming]);

  useEffect(() => {
    return () => {
      if (acceptTimeoutRef.current) {
        window.clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = null;
      }
    };
  }, []);

  const forceResetSoon = useCallback((delayMs = 300) => {
    window.setTimeout(() => {
      resetCall?.();
    }, delayMs);
  }, [resetCall]);

  const handleAccept = useCallback(async () => {
    if (acceptingRef.current || !acceptReady) return;
    acceptingRef.current = true;
    setAccepting(true);
    setCallNotice('Dang ket noi am thanh...');

    if (acceptTimeoutRef.current) {
      window.clearTimeout(acceptTimeoutRef.current);
    }

    acceptTimeoutRef.current = window.setTimeout(() => {
      console.error('Accept call timeout: reset stale call node');
      setCallNotice('Ket noi that bai, vui long goi lai');
      acceptingRef.current = false;
      setAccepting(false);
      resetCall?.();
    }, 15000);

    try {
      await acceptCall();
    } catch (err) {
      console.error('Accept call error:', err);
      if (acceptTimeoutRef.current) {
        window.clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = null;
      }
      acceptingRef.current = false;
      setCallNotice('Ket noi that bai, vui long goi lai');
      setAccepting(false);
      resetCall?.();
    }
  }, [acceptCall, acceptReady, resetCall]);

  const handleReject = useCallback(async () => {
    if (rejecting) return;
    setRejecting(true);
    try {
      await Promise.race([
        rejectCall(),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch (err) {
      console.error('Reject call error:', err);
    } finally {
      forceResetSoon(0);
      setRejecting(false);
    }
  }, [forceResetSoon, rejectCall, rejecting]);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try {
      await Promise.race([
        endCall(),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch (err) {
      console.error('End call error:', err);
    } finally {
      forceResetSoon(0);
      setEnding(false);
    }
  }, [endCall, ending, forceResetSoon]);

  if (!callStatus && !errorMessage) return null;

  const peerInfo = isIncoming ? callerInfo : receiverInfo;
  const peerName = resolveCallPeerName(client, callNode, peerInfo);
  const isRinging = callStatus === CallStatus.RINGING || callStatus === CallStatus.PREPARING;
  const isConnected = callStatus === CallStatus.CONNECTED;
  const initial = peerName.charAt(0).toUpperCase();
  const statusLabel = callNotice || (
    isConnected
      ? `Da ket noi ${formatCallDuration(callDuration)}`
      : isIncoming
        ? 'dang goi cho ban...'
        : callStatus === CallStatus.PREPARING
          ? 'Dang ket noi...'
          : 'Dang do chuong...'
  );

  if (errorMessage) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-2xl">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Loi cuoc goi</h3>
          <p className="mb-4 text-sm text-slate-500">{errorMessage}</p>
          <Button onClick={() => { clearError?.(); resetCall?.(); }}>Dong</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {isConnected ? 'Dang trong cuoc goi' : isIncoming ? 'Cuoc goi den' : 'Dang goi'}
          </h2>
        </div>

        <div className="flex flex-col items-center bg-slate-100 px-6 py-8 text-center">
          <div className="relative mb-4 flex h-28 w-28 items-center justify-center rounded-full border-4 border-indigo-100 bg-emerald-500 text-4xl font-bold text-white">
            {initial}
          </div>
          <div className="mb-1 text-xl font-bold text-slate-900">{peerName}</div>
          <div className="mb-6 text-sm text-slate-500">{statusLabel}</div>

          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600">
            <Phone className="h-4 w-4" /> Audio Call
          </div>

          {isRinging && isIncoming && (
            <div className="flex gap-10">
              <button
                type="button"
                onClick={handleReject}
                disabled={rejecting}
                className="flex flex-col items-center gap-2 text-sm text-slate-600 disabled:opacity-70"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-200">
                  {rejecting ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
                </span>
                Tu choi
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting || !acceptReady}
                className="flex flex-col items-center gap-2 text-sm text-slate-600 disabled:opacity-70"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                  {accepting || !acceptReady ? <Loader2 className="h-6 w-6 animate-spin" /> : <Phone className="h-6 w-6" />}
                </span>
                Nghe may
              </button>
            </div>
          )}

          {isRinging && !isIncoming && (
            <button
              type="button"
              onClick={handleEnd}
              disabled={ending}
              className="flex flex-col items-center gap-2 text-sm text-slate-600 disabled:opacity-70"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-200">
                {ending ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
              </span>
              Huy
            </button>
          )}

          {isConnected && (
            <div className="flex gap-5">
              <button
                type="button"
                onClick={toggleMic}
                className={`flex flex-col items-center gap-2 text-sm ${isMicMuted ? 'text-red-600' : 'text-slate-600'}`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${isMicMuted ? 'bg-red-500' : 'bg-slate-700'}`}>
                  {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </span>
                {isMicMuted ? 'Bat mic' : 'Tat mic'}
              </button>
              <button
                type="button"
                onClick={handleEnd}
                disabled={ending}
                className="flex flex-col items-center gap-2 text-sm text-slate-600 disabled:opacity-70"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white">
                  {ending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
                </span>
                Ket thuc
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClassChat({ classroomId, ermisChannelId, ermisChannelType, hideChat, isTeacher, teacher, students = [] }: ClassChatProps) {
  const { user } = useAuth();
  const [chatReady, setChatReady] = useState(false);
  const [error, setError] = useState('');
  const [chatClient, setChatClient] = useState<ErmisChat | null>(null);
  const callSessionId = useMemo(() => getCallSessionId(user?.ermisUserId), [user?.ermisUserId]);
  const knownClassUsers = useMemo(
    () => buildKnownClassUsers(user, teacher, students),
    [students, teacher, user]
  );
  const knownClassUsersById = useMemo(
    () => Object.fromEntries(knownClassUsers.map((item) => [item.id, item])),
    [knownClassUsers]
  );

  useEffect(() => {
    for (const knownUser of knownClassUsers) {
      rememberCallUserName(knownUser.id, knownUser.name);
    }
  }, [knownClassUsers]);

  useEffect(() => {
    if (!user?.ermisUserId || !user?.ermisToken || !API_KEY) {
      return;
    }

    const ermisUserId = user.ermisUserId;
    const ermisToken = user.ermisToken;

    let mounted = true;
    let localClient: any = null;

    const initChat = async () => {
      setError('');
      try {
        localClient = new ErmisChat(API_KEY, PROJECT_ID, BASE_URL);

        // Override getBatchUsers to fix SDK duplicate page parameter bug and hydrate classroom display names.
        localClient.getBatchUsers = async (users: string[], page?: number, page_size?: number) => {
          const finalPage = page || 1;
          const finalPageSize = page_size || 10000;
          const usersResponse = await localClient.post(
            localClient.userBaseURL + '/users/batch',
            { users, project_id: localClient.projectId },
            { page: finalPage, page_size: finalPageSize }
          );
          const mergedUsers = mergeKnownUserProfiles(usersResponse.data || [], knownClassUsersById);
          
          if (localClient.userID) {
            (localClient as any)._upsertUsers(mergedUsers);
          }
          return mergedUsers;
        };

        if (localClient.userID !== ermisUserId) {
          if (localClient.userID) {
            await localClient.disconnectUser();
          }
          await localClient.connectUser(
            {
              id: ermisUserId,
              name: user.displayName || user.username,
              image: user.avatar,
            },
            ermisToken
          );
        }

        (localClient as any)._upsertUsers?.(knownClassUsers);
        await ensureCallPrivacyEveryone(ermisToken);

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
  }, [knownClassUsers, knownClassUsersById, user?.ermisUserId, user?.ermisToken, user?.displayName, user?.username, user?.avatar]);

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
      <ChatProvider
        client={chatClient as any}
        initialTheme="light"
        enableCall={true}
        callSessionId={callSessionId}
        CallUIComponent={ClassCallUI}
        incomingCallAudioPath="/call_incoming.mp3"
        outgoingCallAudioPath="/call_outgoing.mp3"
      >
        <ClassChatUserHydrator users={knownClassUsers} />
        <ActiveChannelSetter channelId={ermisChannelId} channelType={ermisChannelType || 'messaging'} />
        <RaiseHand
          classroomId={classroomId}
          isTeacher={isTeacher}
          teacher={teacher}
        />
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
