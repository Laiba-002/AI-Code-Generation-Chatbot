import {
  Bot,
  Clock,
  Code,
  FileText,
  FolderOpen,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Terminal,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { User as UserType } from "../services/authService";
import { Model } from "../types";
import api from "../utils/api";

interface SidebarProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onNewChat: () => void;
  currentUser: UserType | null;
  onLogout: () => void;
  messageCount?: number;
  onChatsClick?: () => void;
  onProjectsClick?: () => void;
  onDocumentsClick?: () => void;
  onSettingsClick?: () => void;
  onSystemPromptClick?: () => void;
  onArtifactsClick?: () => void;
  activeSection?: string;
  onSessionSelect?: (sessionId: number) => void;
  currentSessionId?: number;
  refreshSessions?: () => void;
  refreshSessionsTrigger?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  models,
  selectedModel,
  onModelChange,
  onNewChat,
  currentUser,
  onLogout,
  messageCount = 0,
  onChatsClick,
  onProjectsClick,
  onDocumentsClick,
  onSettingsClick,
  onSystemPromptClick,
  onArtifactsClick,
  activeSection = "chats",
  onSessionSelect,
  currentSessionId,
  refreshSessions,
  refreshSessionsTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);

  // Fetch chat sessions when chats section is active
  const fetchSessions = useCallback(async () => {
    const now = Date.now();

    // Prevent multiple simultaneous calls
    if (fetchInProgressRef.current) {
      console.log("Sidebar: Fetch already in progress, skipping...");
      return;
    }

    // Prevent calls that are too frequent (less than 1 second apart)
    if (now - lastFetchTime < 1000) {
      console.log("Sidebar: Too soon since last fetch, skipping...");
      return;
    }

    fetchInProgressRef.current = true;
    setLoading(true);
    setLastFetchTime(now);

    try {
      console.log("Sidebar: Fetching sessions...");
      const response = await api.getSessions();
      console.log("Sidebar: Sessions response:", response);
      if (response.success) {
        console.log("Sidebar: Setting sessions:", response.sessions);
        setSessions(response.sessions);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [lastFetchTime]);

  // Debounced effect to prevent rapid successive calls
  useEffect(() => {
    if (activeSection === "chats" && isOpen) {
      const timeoutId = setTimeout(() => {
        fetchSessions();
      }, 200); // Increased debounce to 200ms

      return () => clearTimeout(timeoutId);
    }
  }, [activeSection, isOpen, refreshSessionsTrigger, fetchSessions]);
  // ...existing imports...

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // md and below
        setIsOpen(false);
      }
    };
    handleResize(); // Run on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const deleteSession = async (sessionId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await api.deleteSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      refreshSessions?.();
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 168) {
      // 7 days
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const truncateTitle = (title: string) => {
    return title.length > 30 ? title.substring(0, 30) + "..." : title;
  };

  return (
    <div
      className={` bg-chat-sidebar border-r border-gray-700 flex flex-col justify-between transition-all duration-300  ${
        isOpen ? "w-72" : "w-16"
      } h-screen`}
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {isOpen && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="text-white font-semibold text-lg">
                AI Chatbot
              </span>
            </div>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-gray-400 hover:text-white transition-colors flex items-center justify-center rounded-md p-1"
          >
            {isOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 " />
            )}
          </button>
        </div>

        {/* New Chat Button */}
        <div className={`p-${isOpen ? 4 : 2}`}>
          <button
            onClick={onNewChat}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-4 py-2 flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isOpen && <span>New Chat</span>}
          </button>
        </div>

        {/* Navigation */}
        <div className="px-2">
          <button
            onClick={onChatsClick}
            className={`sidebar-item w-full flex items-center space-x-3 ${
              activeSection === "chats"
                ? "bg-primary-500/20 border border-primary-500/30"
                : ""
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {isOpen && <span>Chats</span>}
          </button>

          <button
            onClick={onProjectsClick}
            className={`sidebar-item w-full flex items-center space-x-3 ${
              activeSection === "projects"
                ? "bg-primary-500/20 border border-primary-500/30"
                : ""
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            {isOpen && <span>Projects</span>}
          </button>

          <button
            onClick={onDocumentsClick}
            className={`sidebar-item w-full flex items-center space-x-3 ${
              activeSection === "documents"
                ? "bg-primary-500/20 border border-primary-500/30"
                : ""
            }`}
          >
            <FileText className="w-5 h-5" />
            {isOpen && <span>Documents</span>}
          </button>

          <button
            onClick={onSystemPromptClick}
            className={`sidebar-item w-full flex items-center space-x-3 ${
              activeSection === "system-prompt"
                ? "bg-primary-500/20 border border-primary-500/30"
                : ""
            }`}
          >
            <Terminal className="w-5 h-5" />
            {isOpen && <span>System Prompt</span>}
          </button>

          <button
            onClick={onArtifactsClick}
            className={`sidebar-item w-full flex items-center space-x-3 ${
              activeSection === "artifacts"
                ? "bg-primary-500/20 border border-primary-500/30"
                : ""
            }`}
          >
            <Code className="w-5 h-5" />
            {isOpen && <span>Artifacts</span>}
          </button>
        </div>

        {/* Chat History Section */}

        {activeSection === "chats" && isOpen && (
          <div className="flex-1 px-4 overflow-y-auto chat-scrollbar">
            <div className="sidebar-item mb-2 px-2">Recent Chats</div>
            {loading ? (
              <div className=" p-4 text-center text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500 mx-auto"></div>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>No chat history yet</p>
              </div>
            ) : (
              <div className="space-y-0">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => {
                      console.log(
                        "Sidebar: Session clicked:",
                        session.id,
                        session.title
                      );
                      onSessionSelect?.(session.id);
                    }}
                    className={`group relative p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      currentSessionId === session.id
                        ? "bg-primary-500/20 border border-primary-500/30"
                        : "hover:bg-gray-700/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <Bot className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <h3 className=" font-medium text-md truncate capitalize">
                            {session.title === "hi"
                              ? "Greetings Exchange"
                              : truncateTitle(session.title)}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-400">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(session.updated_at)}</span>
                          </span>
                          {/* <span>{session.message_count} messages</span> */}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3 text-red-400 hover:text-red-300" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversation Info */}
      {/* {messageCount > 0 && (
        <div className="p-4 border-t border-gray-700">
          {isOpen && (
            <>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Current Chat
              </div>
              <div className="text-sm text-gray-300">
                <div className="flex items-center justify-between">
                  <span>Messages:</span>
                  <span className="text-primary-400 font-medium">
                    {messageCount}
                  </span>
                </div>
                {messageCount > 2 && (
                  <div className="flex items-center mt-2 text-xs text-blue-400">
                    <Brain className="w-3 h-3 mr-1" />
                    <span>Context aware</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )} */}

      {/* Model Selection */}
      {/* <div className="p-4 border-t border-gray-700">
        {isOpen ? (
          <>
            <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
              AI Model
            </div>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="model-selector w-full"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {models.find((m) => m.id === selectedModel) && (
              <div className="mt-2 text-xs text-gray-400">
                {models.find((m) => m.id === selectedModel)?.description}
              </div>
            )}
          </>
        ) : (
          <Settings className="w-5 h-5 mx-auto text-gray-400" />
        )}
      </div> */}

      {/* User Profile */}

      {currentUser && (
        <div
          className={`py-4 ${
            isOpen ? "pl-4" : "pl-0"
          } border-t border-gray-700 relative`}
        >
          <div
            className={`flex items-center space-x-3 cursor-pointer ${
              isOpen ? "" : "justify-center"
            }`}
            onClick={() => setProfileModalOpen(true)}
            id="profile-trigger"
          >
            <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {currentUser.username?.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div className="flex-1 min-w-0 ">
                <p className="text-white text-sm font-medium truncate">
                  {currentUser.username}
                </p>
              </div>
            )}
          </div>
          {/* Profile Popover Modal */}
          {profileModalOpen && (
            <div
              className="absolute right-4 bottom-16 z-50 bg-gray-800 rounded-lg shadow-lg w-64"
              style={{ minWidth: "220px" }}
            >
              <div className="flex items-center space-x-3 p-4 border-b border-gray-700">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {currentUser?.username?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-base font-semibold">
                    {currentUser?.username}
                  </p>
                  <p className="text-gray-400 text-xs">{currentUser?.email}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center space-x-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-b-lg px-3 py-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Logout</span>
              </button>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="w-full text-center text-xs text-gray-400 hover:text-white py-2"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
