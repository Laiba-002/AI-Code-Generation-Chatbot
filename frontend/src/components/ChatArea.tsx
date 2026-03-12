import { AlertCircle, ArrowDown, ArrowUp, Brain } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Message } from "../types";
import ChatMessage from "./ChatMessage";
import TypingIndicator from "./TypingIndicator";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onStartChat: () => void;
  hideCodeBlocks?: boolean;
  // onToggleCodePanel?: (msgID: any) => void;
  onToggleCodePanel?: (messageId?: string) => void; // Make messageId optional
  selectedMessageId?: string | null; // Add this new prop
  models?: any[]; // Add models prop
  modelsLoaded?: boolean; // Add modelsLoaded prop
}

const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onStartChat,
  hideCodeBlocks = false,
  onToggleCodePanel,
  selectedMessageId, // Add this parameter
  models = [],
  modelsLoaded = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const scrollToTop = () => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;

      // Show scroll to top button when scrolled more than 300px from top
      setShowScrollTop(scrollTop > 300);

      // Check if user is near bottom (within 100px)
      const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsNearBottom(nearBottom);
    }
  };

  // Auto-scroll to bottom when new messages arrive, but only if user is near bottom
  useEffect(() => {
    if (isNearBottom) {
      // Use immediate scroll for new messages to feel responsive
      setTimeout(() => scrollToBottom("smooth"), 50);
    }
  }, [messages.length, isLoading, isNearBottom]);

  // Attach scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      // Call once to set initial state
      handleScroll();
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);
  //  useEffect(()=>{console.log(messages,"these are messages-->")},[messages])
  // Show no models warning if models are loaded but none are available
  if (modelsLoaded && models.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-4">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          </div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">
            No AI Models Available
          </h3>
          <p className="text-gray-400 mb-4">
            No AI models are currently available for chat. Please check your
            model installation or contact your administrator.
          </p>
          <div className="text-sm text-gray-500">
            <p>To resolve this issue:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Ensure Ollama is running</li>
              <li>Install at least one AI model</li>
              <li>Check your internet connection</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no messages
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">
            Start a conversation by typing a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative min-h-0">
      {/* Context Awareness Indicator */}
      {messages.length > 2 && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 px-4 bg-blue-500/10 border-b border-blue-500/20">
          <Brain className="w-4 h-4 text-blue-400 mr-2" />
          <span className="text-sm text-blue-400">
            Context aware - Remembering previous conversation
          </span>
        </div>
      )}

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 chat-scrollbar p-6 space-y-4 min-h-0 overflow-y-auto"
      >
        {/* // Update the messages mapping (replace existing map function) */}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            hideCodeBlocks={hideCodeBlocks}
            onToggleCodePanel={() => onToggleCodePanel?.(message.id)} // Pass message ID
            isSelected={selectedMessageId === message.id} // Add selection state
          />
        ))}

        {/* Typing Indicator */}
        {isLoading && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed top-0.5 right-64 flex flex-col space-y-2 z-100">
        {/* Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="bg-gray-700/90 hover:bg-gray-600/90 text-white p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 backdrop-blur-sm"
            title="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}

        {/* Scroll to Bottom Button - only show when not near bottom and there are messages */}
        {!isNearBottom && messages.length > 0 && (
          <button
            onClick={() => scrollToBottom()}
            className="bg-blue-600/90 hover:bg-blue-500/90 text-white p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 backdrop-blur-sm"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatArea;
