import {
  Atom,
  Bot,
  Code,
  FileText,
  Globe,
  Palette,
  User,
  Zap,
} from "lucide-react";
import React from "react";
import { Message } from "../types";
import ContentRenderer from "./ContentRenderer";

interface ChatMessageProps {
  message: Message;
  hideCodeBlocks?: boolean;
  onToggleCodePanel?: (msgID: any) => void;
  isSelected?: boolean; // Add this new prop
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  hideCodeBlocks = false,
  onToggleCodePanel,
  isSelected = false,
}) => {
  const isUser = message.role === "user";
  
  // Don't render empty assistant messages (they're handled by TypingIndicator)
  if (!isUser && (!message.content || message.content.trim() === "")) {
    return null;
  }
  // Function to detect if message has code blocks
  const hasCodeBlocks = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const incompleteCodeBlockRegex = /```(\w+)?\n([\s\S]*)$/g;
    return (
      codeBlockRegex.test(content) || incompleteCodeBlockRegex.test(content)
    );
  };

  const detectCodeBlocks = (text: string) => {
    const matches: { language: string; code: string; fullMatch: string }[] = [];

    // Detect complete blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push({
        language: match[1] || "text",
        code: match[2],
        fullMatch: match[0],
      });
    }

    // Detect incomplete/streaming blocks
    const incompleteCodeBlockRegex = /```(\w+)?\n([\s\S]*)$/g;
    let incompleteMatch: any;
    while ((incompleteMatch = incompleteCodeBlockRegex.exec(text)) !== null) {
      const isAlreadyCaptured = matches.some(
        (m) =>
          m.fullMatch.includes(incompleteMatch![0]) ||
          incompleteMatch![0].includes(m.fullMatch)
      );

      if (!isAlreadyCaptured && incompleteMatch[2].trim().length > 0) {
        matches.push({
          language: incompleteMatch[1] || "text",
          code: incompleteMatch[2],
          fullMatch: incompleteMatch[0],
        });
      }
    }

    return matches;
  };

  const generateDynamicArtifactName = (
    language?: string,
    code?: string
  ): string => {
    const lang = language?.toLowerCase() || "";
    const content = code?.toLowerCase() || "";

    // HTML-specific patterns
    if (
      lang === "html" ||
      content.includes("<!doctype html>") ||
      content.includes("<html")
    ) {
      if (content.includes("tic tac toe") || content.includes("tictactoe")) {
        return "Tic Tac Toe Game";
      }
      if (content.includes("login") && content.includes("form")) {
        return "Login Form";
      }
      if (content.includes("signup") || content.includes("register")) {
        return "Registration Form";
      }
      if (content.includes("todo") || content.includes("task")) {
        return "Todo List Application";
      }
      if (content.includes("calculator")) {
        return "Calculator App";
      }
      if (content.includes("weather")) {
        return "Weather App";
      }
      if (content.includes("dashboard")) {
        return "Dashboard Interface";
      }
      if (content.includes("portfolio")) {
        return "Portfolio Website";
      }
      if (content.includes("landing")) {
        return "Landing Page";
      }
      if (content.includes("navbar") || content.includes("navigation")) {
        return "Navigation Component";
      }
      if (content.includes("modal")) {
        return "Modal Component";
      }
      return "HTML Application";
    }

    // React/JSX specific patterns
    if (
      lang === "jsx" ||
      lang === "tsx" ||
      content.includes("react") ||
      content.includes("usestate")
    ) {
      if (content.includes("login") && content.includes("authentication")) {
        return "React Login Form with Authentication";
      }
      if (content.includes("todo") || content.includes("task")) {
        return "React Todo List";
      }
      if (content.includes("counter")) {
        return "React Counter Component";
      }
      if (content.includes("form") && content.includes("validation")) {
        return "React Form with Validation";
      }
      return "React Component";
    }

    // JavaScript specific patterns
    if (lang === "javascript" || lang === "js") {
      if (content.includes("api") && content.includes("fetch")) {
        return "API Integration Script";
      }
      if (content.includes("game")) {
        return "Game Logic Script";
      }
      return "JavaScript Script";
    }

    // CSS specific patterns
    if (lang === "css") {
      if (content.includes("responsive") || content.includes("media query")) {
        return "Responsive CSS Styles";
      }
      if (content.includes("animation") || content.includes("keyframe")) {
        return "CSS Animations";
      }
      return "CSS Stylesheet";
    }

    // Python specific patterns
    if (lang === "python" || lang === "py") {
      if (content.includes("flask") || content.includes("django")) {
        return "Python Web Application";
      }
      if (content.includes("api")) {
        return "Python REST API";
      }
      return "Python Script";
    }

    // Generic fallback
    const languageNames: { [key: string]: string } = {
      java: "Java Application",
      cpp: "C++ Program",
      c: "C Program",
      typescript: "TypeScript Module",
      ts: "TypeScript Module",
      php: "PHP Script",
      ruby: "Ruby Script",
      go: "Go Program",
      rust: "Rust Program",
      sql: "SQL Query",
      bash: "Bash Script",
      yaml: "YAML Configuration",
      json: "JSON Data",
      xml: "XML Document",
      markdown: "Markdown Document",
    };

    return languageNames[lang] || `${lang?.toUpperCase() || "CODE"} Code`;
  };
  const messageHasCode = hasCodeBlocks(message.content);

  // Get the first code block to generate the dynamic name
  const getArtifactName = () => {
    const codeBlocks = detectCodeBlocks(message.content);
    console.log(codeBlocks);
    if (codeBlocks.length > 0) {
      const firstBlock = codeBlocks[0];
      return generateDynamicArtifactName(firstBlock.language, firstBlock.code);
    }
    return "Code Generated Successfully!";
  };

  // Get the appropriate icon based on the artifact type
  const getArtifactIcon = () => {
    const codeBlocks = detectCodeBlocks(message.content);
    if (codeBlocks.length > 0) {
      const firstBlock = codeBlocks[0];
      const lang = firstBlock.language?.toLowerCase() || "";
      const content = firstBlock.code?.toLowerCase() || "";

      // Check for React/JSX content
      if (
        lang === "jsx" ||
        lang === "tsx" ||
        lang === "react" ||
        content.includes("react") ||
        content.includes("usestate") ||
        content.includes("useeffect") ||
        content.includes("function app") ||
        content.includes("export default") ||
        content.includes("import react") ||
        content.includes("from 'react'") ||
        content.includes('from "react"') ||
        (content.includes("import {") && content.includes("} from")) ||
        (content.includes("return (") && content.includes("<"))
      ) {
        return <Atom className="w-5 h-5" />;
      }

      // Check for HTML content
      if (
        lang === "html" ||
        content.includes("<!doctype html>") ||
        content.includes("<html")
      ) {
        return <Globe className="w-5 h-5" />;
      }

      // Check for CSS content
      if (
        lang === "css" ||
        (content.includes("{") &&
          content.includes(":") &&
          !content.includes("import") &&
          !content.includes("function") &&
          !content.includes("const ") &&
          !content.includes("let ") &&
          !content.includes("var "))
      ) {
        return <Palette className="w-5 h-5" />;
      }

      // Check for JavaScript content
      if (
        lang === "javascript" ||
        lang === "js" ||
        content.includes("function") ||
        content.includes("const ")
      ) {
        return <Code className="w-5 h-5" />;
      }

      // Default icon for other code types
      return <Zap className="w-5 h-5" />;
    }
    return <FileText className="w-5 h-5" />;
  };
  // useEffect(()=>{console.log(message.id,"this is message-->")},[message])
  return (
    <div className={` flex ${isUser ? "justify-end" : "justify-start"} mb-4 `}>
      <div
        className={`flex items-start space-x-3 max-w-4xl ${
          isUser ? "flex-row-reverse space-x-reverse" : ""
        }`}
      >
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser ? "bg-primary-500" : "bg-gray-600"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Bot className="w-4 h-4 text-white" />
          )}
        </div>

        <div className="flex flex-col ">
          {/* Message Content */}
          <div
            className={`chat-message ${
              isUser ? "user-message" : "assistant-message"
            }`}
          >
            <ContentRenderer
              content={message.content}
              metadata={message.metadata}
              hideCodeBlocks={hideCodeBlocks}
              //  onToggleCodePanel={onToggleCodePanel}
              onToggleCodePanel={() => onToggleCodePanel?.(message.id)}
              onArtifactClick={(artifactId) => {
                console.log("Artifact clicked:", artifactId);
                // You can add additional logic here for artifact handling
              }}
              msgid={message.id}
            />
            {/* Attachments */}
            {/* {message.attachments && message.attachments.length > 0 && (
  <div className="flex flex-wrap gap-2">
    {message.attachments.map((attachment:any, index) => (
      <img
        key={index}
        src={attachment?.url} // ✅ access object property
        alt={`attachment-${index}`}
        className="w-32 h-32 object-cover rounded-lg border border-gray-300"
      />
    ))}
  </div>
)} */}

            {/* Message Metadata */}
            <div
              className={`flex items-center space-x-2 mt-2 text-xs text-gray-400 ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              <span>{message.timestamp.toLocaleTimeString()}</span>
              {message.model && (
                <span className="bg-gray-700 px-2 py-1 rounded">
                  {message.model}
                </span>
              )}
            </div>
          </div>
          {/* Code Availability Notification - separate block at the end */}
          {messageHasCode && (
            <div className="mt-3 w-1/2 min-w-fit">
              <div
                className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 cursor-pointer hover:bg-blue-500/20 transition-all duration-200 hover:scale-[1.02] group"
                onClick={() => onToggleCodePanel?.(message.id)}
                title="Click to open code panel"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                    <div className="text-blue-400">{getArtifactIcon()}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-blue-400 font-semibold">
                        {getArtifactName()}
                      </span>
                    </div>
                    <p className="text-blue-300 text-sm mt-1">
                      Interactive artifact
                    </p>
                    <p className="text-blue-200 text-xs mt-2 flex items-center">
                      {/* <span className="mr-1">Click to view</span> */}
                      {/* <span className="text-blue-300 group-hover:translate-x-1 transition-transform duration-200">→</span> */}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
