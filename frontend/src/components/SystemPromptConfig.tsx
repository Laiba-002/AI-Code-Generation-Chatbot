import {
  AlertCircle,
  Bug,
  CheckCircle,
  FileText,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { api } from "../utils/api";

interface SystemPromptConfigProps {
  onClose: () => void;
}

const SystemPromptConfig: React.FC<SystemPromptConfigProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadCurrentPrompt();
  }, []);

  const loadCurrentPrompt = async (retryCount = 0) => {
    setIsLoading(true);
    try {
      const data = await api.get("/system-prompt");
      setPrompt(data.prompt);
      setMessage(null); // Clear any previous error messages
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (retryCount < 2) {
          console.log(`Request timeout, retrying... (${retryCount + 1}/3)`);
          setTimeout(() => loadCurrentPrompt(retryCount + 1), 1000);
          return;
        } else {
          setMessage({
            type: "error",
            text: "Request timeout after multiple attempts. Using default prompt.",
          });
        }
      } else {
        setMessage({
          type: "error",
          text: `Error loading prompt: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }

      console.error("Load prompt error:", error);

      // Set default prompt on error
      if (!prompt) {
        setPrompt(`You are CodeGenius AI, an expert full-stack developer and code generation specialist.

For non-programming questions, politely redirect: "I'm CodeGenius AI, specialized in software development and code generation. I can help you with full-stack development, API design, database architecture, debugging, and more. Is there a coding project I can help you build today?"

Always provide complete, production-ready code solutions with proper error handling, security measures, and documentation.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const savePrompt = async () => {
    if (!prompt.trim()) {
      setMessage({ type: "error", text: "Prompt cannot be empty" });
      return;
    }

    setIsSaving(true);
    try {
      await api.post("/system-prompt", { prompt: prompt.trim() });
      setMessage({
        type: "success",
        text: "System prompt updated successfully!",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage({
          type: "error",
          text: "Save request timed out. Please try again.",
        });
      } else {
        setMessage({
          type: "error",
          text: `Error saving prompt: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
      console.error("Save prompt error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const showDebugInfo = async () => {
    try {
      const debugData = await api.get("/system-prompt/debug");
      console.log("=== SYSTEM PROMPT DEBUG INFO ===");
      console.log(
        "Current Working Directory:",
        debugData.current_working_directory
      );
      console.log("Script Directory:", debugData.script_directory);
      console.log("Attempted Paths:", debugData.attempted_paths);
      console.log("File Existence:", debugData.file_exists);
      console.log("File Contents Preview:", debugData.file_contents_preview);
      console.log("=== END DEBUG INFO ===");

      setMessage({
        type: "success",
        text: "Debug information logged to browser console (F12 > Console)",
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Failed to get debug information: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      console.error("Debug error:", error);
    }
  };

  const resetToDefault = () => {
    setPrompt(`You are CodeGenius AI, an expert full-stack developer and code generation specialist. Your primary purpose is to help users create, modify, debug, and understand code across all programming languages and frameworks.

=== CORE IDENTITY ===
- You are a CODE-FOCUSED AI assistant specialized in software development
- Your expertise spans full-stack development, DevOps, database design, API development, and system architecture
- You excel at generating production-ready, secure, and scalable code solutions
- You follow industry best practices and modern development patterns

=== PRIMARY CAPABILITIES ===
**CODE GENERATION:**
- Generate complete applications from requirements
- Create full-stack solutions (MERN, MEAN, Django+React, Flask+React, etc.)
- Build REST APIs, GraphQL APIs, and microservices
- Develop responsive web applications and mobile apps
- Create database schemas and migrations
- Generate configuration files and deployment scripts

**SUPPORTED TECHNOLOGIES:**
Frontend: React, Vue.js, Angular, Svelte, Next.js, Nuxt.js, HTML/CSS/JavaScript
Backend: Node.js, Python (Django/Flask/FastAPI), PHP, Java, C#, Ruby, Go
Databases: MongoDB, PostgreSQL, MySQL, SQLite, Redis, Firebase
DevOps: Docker, Kubernetes, CI/CD, AWS, Azure, GCP
Mobile: React Native, Flutter, Swift, Kotlin

**FOR NON-CODE REQUESTS:**
When users ask non-programming questions, respond politely but redirect to your coding expertise:

"I'm CodeGenius AI, specialized in software development and code generation. While I'd love to help with [topic], my expertise is in creating amazing applications and solving programming challenges.

I can help you with:
• Full-stack web application development
• API design and implementation  
• Database architecture and optimization
• Code debugging and refactoring
• DevOps and deployment solutions
• Mobile app development
• System architecture planning

Is there a coding project I can help you build today?"

Always provide complete, production-ready code solutions with proper error handling, security measures, and documentation.`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-orange-500" />
            <h2 className="text-xl font-semibold text-white">
              System Prompt Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {/* Message */}
          {message && (
            <div
              className={`mb-4 p-3 rounded-lg flex items-center space-x-2 ${
                message.type === "success"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Description */}
          <div className="mb-4">
            <p className="text-gray-300 text-sm">
              Configure how your AI assistant behaves. This system prompt
              defines the AI's personality, capabilities, and response style.
              Changes take effect immediately for new conversations.
            </p>
          </div>

          {/* Prompt Editor */}
          <div className="flex-1 flex flex-col">
            <label className="text-sm font-medium text-gray-300 mb-2">
              System Prompt
            </label>
            {isLoading ? (
              <div className="flex-1 bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="flex-1 bg-gray-900 text-gray-100 border border-gray-600 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
                placeholder="Enter your system prompt here..."
                style={{ minHeight: "400px" }}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
            <div className="flex space-x-3">
              <button
                onClick={resetToDefault}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                disabled={isLoading || isSaving}
              >
                Reset to Default
              </button>

              <button
                onClick={showDebugInfo}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-yellow-300 hover:text-yellow-200 border border-yellow-600 rounded-lg hover:bg-yellow-600/10 transition-colors"
                disabled={isLoading || isSaving}
              >
                <Bug className="w-4 h-4" />
                <span>Debug Info</span>
              </button>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => loadCurrentPrompt()}
                disabled={isLoading || isSaving}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Reload</span>
              </button>

              <button
                onClick={savePrompt}
                disabled={isLoading || isSaving || !prompt.trim()}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save
                  className={`w-4 h-4 ${isSaving ? "animate-pulse" : ""}`}
                />
                <span>{isSaving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemPromptConfig;
