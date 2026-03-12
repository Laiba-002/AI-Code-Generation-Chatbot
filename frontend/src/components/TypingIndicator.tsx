import React from 'react';
import { Bot } from 'lucide-react';

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start space-x-3 max-w-4xl">
        {/* Avatar */}
        <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        
        {/* Typing Indicator - Wave animation */}
        <div className="flex items-center">
          <div className="typing-indicator">
            <div className="typing-dot typing-dot-1"></div>
            <div className="typing-dot typing-dot-2"></div>
            <div className="typing-dot typing-dot-3"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator; 