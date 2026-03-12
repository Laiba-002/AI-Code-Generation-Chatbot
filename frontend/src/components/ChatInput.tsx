import { File, Play, Plus, Send, Square, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { attachmentService } from "../services/AttachmentService";
import { Model } from "../types";
import AttachmentMenu from "./AttachmentMenu";
import GitHubContentModal from "./GitHubContentModal";

interface ChatInputProps {
  onSendMessage: (message: {}) => void;
  models: Model[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  isLoading: boolean;
  onAttachment?: (label: string, type: string, fileUrl?: string) => void;
  codeGenerationPanel: any;
  setMessageId: any;
  stopGeneration: () => Promise<void>;
  disabled?: boolean; // Add disabled prop
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  models,
  selectedModel,
  onModelChange,
  isLoading,
  onAttachment,
  codeGenerationPanel,
  setMessageId,
  stopGeneration,
  disabled = false,
}) => {
  const [message, setMessage] = useState("");
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Remove local isGenerating state - use isLoading prop instead
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [attachments, setAttachments] = useState<
    { type: string; url: string }[]
  >([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  // Close model menu on outside click, but ignore clicks on the button
  useEffect(() => {
    if (!isModelMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target as Node) &&
        modelButtonRef.current &&
        !modelButtonRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isModelMenuOpen]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((message.trim() || attachedFile) && !isLoading && !disabled) {
      let finalMessage = message.trim();
      // If there's an attached file, include its content with the message
      if (attachedFile && fileContent) {
        finalMessage = `[File: ${
          attachedFile.name
        }]\n\n${fileContent}\n\n---\n\n${
          finalMessage || "Please analyze this file."
        }`;
      }

      onSendMessage(finalMessage);
      setMessage("");
      codeGenerationPanel(false);
      setAttachedFile(null);
      setMessageId(null);
      setFileContent("");
    }
  };

  // const handleFileUpload = async (file: File) => {
  //   try {
  //     const result = await attachmentService.uploadFile(file);
  //     if (result.success && result.content) {
  //       addAttachment("file", result.content);
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };

  // const handleSubmit = (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (!isLoading && (message.trim() || attachments.length > 0)) {
  //     // Send both message & attachments to parent
  //     onSendMessage({ text: message.trim(), attachments });

  //     setMessage("");
  //     setAttachments([]);
  //   }
  // };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Attachment handlers
  const handleFileUpload = async (file: File) => {
    try {
      console.log("=== FILE SELECTION DEBUG ===");
      console.log("File name:", file.name);
      console.log("File size:", file.size);
      console.log("File type:", file.type);

      // Read file content immediately
      const content = await readFileContent(file);

      // Store file and content in state
      setAttachedFile(file);
      setFileContent(content);
      setIsAttachmentMenuOpen(false);
      // Upload immediately
      const uploadResult = await attachmentService.uploadFile(file);
      console.log("Upload result:", uploadResult);
      console.log(
        "File attached successfully, content length:",
        content.length
      );
    } catch (error) {
      console.error("File attachment error:", error);
      alert(
        `Failed to attach file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  // Helper function to read file content
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  // Remove attached file
  const removeAttachedFile = () => {
    setAttachedFile(null);
    setFileContent("");
  };

  const handleScreenshot = async () => {
    const result = await attachmentService.takeScreenshot();
    // console.log('here is result',result)
    if (result.success && result.url) {
      // show preview modal like Claude
      setScreenshotPreview(result.url);
    }
  };

  const confirmScreenshot = () => {
    if (screenshotPreview) {
      setAttachments((prev) => [
        ...prev,
        { type: "screenshot", url: screenshotPreview },
      ]);
    }
    setScreenshotPreview(null);
  };
  const cancelScreenshot = () => {
    setScreenshotPreview(null);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };
  const [isGitHubContentModalOpen, setIsGitHubContentModalOpen] =
    useState(false);

  const handleGitHubConnect = async () => {
    setIsGitHubContentModalOpen(true);
    setIsAttachmentMenuOpen(false);
  };

  const handleGitHubFilesSelect = (files: any[]) => {
    // Format selected files for chat
    const formattedContent = files
      .map(
        (file) =>
          `**File:** \`${file.name}\`\n**Path:** \`${file.path}\`\n**Size:** ${file.size} bytes\n\n`
      )
      .join("---\n\n");

    setMessage(formattedContent);
    setIsGitHubContentModalOpen(false);
  };

  const handleGoogleDriveConnect = async () => {
    try {
      const result = await attachmentService.connectGoogleDrive();
      if (result.success && onAttachment) {
        onAttachment("Google Drive connected successfully", "googledrive");
      }
    } catch (error) {
      console.error("Google Drive connection error:", error);
    }
  };

  const handleProjectSelect = async () => {
    try {
      const projects = await attachmentService.getProjects();
      if (projects.length > 0 && onAttachment) {
        onAttachment("Project selection available", "project");
      }
    } catch (error) {
      console.error("Project selection error:", error);
    }
  };

  const handleSearch = async () => {
    try {
      const result = await attachmentService.searchContent("search query");
      if (result.success && onAttachment) {
        onAttachment("Search functionality available", "search");
      }
    } catch (error) {
      console.error("Search error:", error);
    }
  };

  const handleVoiceInput = async () => {
    try {
      const result = await attachmentService.startVoiceRecording();
      if (result.success) {
        console.log("Voice recording started");
      }
    } catch (error) {
      console.error("Voice input error:", error);
    }
  };
  // Stop handler
  const handleStopGenerating = async () => {
    await stopGeneration();
  };

  return (
    <div className="border-t border-gray-700 bg-chat-bg p-2">
      <form onSubmit={handleSubmit} className="space-y-4 w-full">
        <div className="flex flex-wrap justify-center items-center space-x-4 w-full">
          <div className="flex relative flex-grow max-w-full md:max-w-3xl">
            <div className="flex flex-col w-full max-w-3xl mx-auto chat-input">
              {/* Scrollable input area */}
              <div className="flex-1 min-h-[50px] max-h-48  chat-scrollbar">
                {attachedFile && (
                  <div className="mb-2 p-2 bg-gray-700 rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <File className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-300">
                        {attachedFile.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({(attachedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removeAttachedFile}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {isModelMenuOpen && (
                  <div
                    ref={modelMenuRef}
                    className="absolute right-10 bottom-14 z-50 bg-gray-800 rounded-lg shadow-lg w-56 border border-gray-700"
                  >
                    <div className="p-3">
                      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        AI Models
                      </div>
                      <ul>
                        {models.map((model) => (
                          <li
                            key={model.id}
                            onClick={() => {
                              onModelChange(model.id);
                              setIsModelMenuOpen(false);
                            }}
                            className={`cursor-pointer px-2 py-2 rounded flex flex-col transition-colors
                ${
                  selectedModel === model.id
                    ? "bg-primary-500/20 border border-orange-500 text-gray-300"
                    : "hover:bg-gray-700 text-gray-300"
                }
              `}
                          >
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {model.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    disabled
                      ? "No AI models available - Chat disabled"
                      : attachedFile
                      ? "Ask me something about this file..."
                      : "How can I help you today?"
                  }
                  className=" w-full min-h-[44px] bg-transparent focus:outline-none resize-none "
                  rows={1}
                  disabled={isLoading || disabled}
                />
              </div>
              {/* Action buttons row, always at bottom */}
              <div className="flex items-center justify-between mt-[-14px]">
                {/* Plus button */}
                <button
                  type="button"
                  onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                  className="p-2 text-gray-400 hover:text-gray-300 transition-colors hover:bg-gray-700 border rounded"
                  disabled={isLoading || disabled}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div>
                  {/* Model selector button */}
                  <button
                    type="button"
                    ref={modelButtonRef}
                    onClick={() =>
                      !disabled && setIsModelMenuOpen((prev) => !prev)
                    }
                    className="p-2 text-gray-400 hover:text-gray-300 transition-colors"
                    disabled={isLoading || disabled}
                    title={
                      disabled ? "No AI models available" : "Select AI Model"
                    }
                  >
                    <span className="flex items-center">
                      {disabled ? "No Models" : selectedModel}
                      <svg
                        className="ml-1 w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {/* Send/Stop button */}
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStopGenerating}
                      className="send-button "
                    >
                      <Square className="w-4 h-4" fill="currentColor" strokeWidth={0} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!message.trim() || isLoading || disabled}
                      className="send-button"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <AttachmentMenu
              isOpen={isAttachmentMenuOpen}
              onClose={() => setIsAttachmentMenuOpen(false)}
              onFileUpload={handleFileUpload}
              onScreenshot={handleScreenshot}
              onGitHubConnect={handleGitHubConnect}
              onGoogleDriveConnect={handleGoogleDriveConnect}
              onProjectSelect={handleProjectSelect}
              onSearch={handleSearch}
            />
          </div>
        </div>

        {/* Help Text */}
        <div className="text-xs text-gray-500 text-center">
          Press Enter to send, Shift+Enter for new line • Ctrl+K to toggle code
          panel
        </div>
      </form>

      {screenshotPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-gray-800 p-4 rounded-lg">
            <img
              src={screenshotPreview}
              alt="Screenshot Preview"
              className="max-w-full max-h-[80vh] rounded"
            />
            <div className="flex justify-end mt-4 space-x-2">
              <button
                onClick={cancelScreenshot}
                className="px-4 py-2 bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmScreenshot}
                className="px-4 py-2 bg-blue-500 rounded"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 my-2 items-center justify-center">
          {attachments.map((att, index) => (
            <div key={index} className="relative">
              <img
                src={att.url}
                alt={att.type}
                className="w-24 h-24 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="absolute top-1 right-1 bg-black bg-opacity-50 rounded-full p-1 text-white hover:bg-opacity-70"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* GitHub Content Modal */}
      <GitHubContentModal
        isOpen={isGitHubContentModalOpen}
        onClose={() => setIsGitHubContentModalOpen(false)}
        onFilesSelect={handleGitHubFilesSelect}
      />
    </div>
  );
};

export default ChatInput;
