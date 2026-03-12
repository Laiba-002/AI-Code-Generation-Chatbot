import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Clock, Bot } from 'lucide-react';
import api from '../utils/api';

export interface ChatSession {
  id: number;
  title: string;
  model_used: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface ChatHistoryProps {
  onSessionSelect: (sessionId: number) => void;
  onNewChat: () => void;
  currentSessionId?: number;
  isVisible: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  onSessionSelect,
  onNewChat,
  currentSessionId,
  isVisible
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/sessions');
      if (response.success) {
        setSessions(response.sessions);
      } else {
        setError('Failed to load chat history');
      }
    } catch (err) {
      setError('Failed to load chat history');
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await api.delete(`/sessions/${sessionId}`);
      setSessions(prev => prev.filter(session => session.id !== sessionId));
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const truncateTitle = (title: string) => {
    return title.length > 40 ? title.substring(0, 40) + '...' : title;
  };

  useEffect(() => {
    if (isVisible) {
      fetchSessions();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="h-full bg-chat-sidebar border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Chat History</h2>
          <button
            onClick={onNewChat}
            className="bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1 text-sm transition-colors"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-400">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto mb-2"></div>
            Loading chats...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-400">
            {error}
            <button
              onClick={fetchSessions}
              className="block mt-2 text-primary-400 hover:text-primary-300"
            >
              Try again
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No chat history yet</p>
            <p className="text-sm">Start a new conversation to see it here</p>
          </div>
        ) : (
          <div className="p-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-200 mb-1 ${
                  currentSessionId === session.id
                    ? 'bg-primary-500/20 border border-primary-500/30'
                    : 'hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <Bot className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <h3 className="text-white font-medium text-sm truncate">
                        {truncateTitle(session.title)}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-gray-400">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(session.updated_at)}</span>
                      </span>
                      <span>{session.message_count} messages</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
                    title="Delete chat"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistory;
