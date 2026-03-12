import {
  Camera,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  Paperclip,
  Search,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";

interface AttachmentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File) => void;
  onScreenshot: () => void;
  onGitHubConnect: () => void;
  onGoogleDriveConnect: () => void;
  onProjectSelect: () => void;
  onSearch: () => void;
}

const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  isOpen,
  onClose,
  onFileUpload,
  onScreenshot,
  onGitHubConnect,
  onGoogleDriveConnect,
  onProjectSelect,
  onSearch,
}) => {
  const [isGoogleDriveConnected, setIsGoogleDriveConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    console.log("File select event:", files);
    if (files && files.length > 0) {
      console.log(
        "Selected file:",
        files[0].name,
        "Size:",
        files[0].size,
        "Type:",
        files[0].type
      );
      onFileUpload(files[0]);
      onClose();
    } else {
      console.log("No files selected");
    }
  };

  const handleGoogleDriveToggle = () => {
    if (isGoogleDriveConnected) {
      setIsGoogleDriveConnected(false);
    } else {
      onGoogleDriveConnect();
      setIsGoogleDriveConnected(true);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Menu */}
      <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-64">
        <div className="p-2">
          {/* Header */}
          <div className="flex items-center justify-between p-2 border-b border-gray-700">
            <span className="text-white text-sm font-medium">
              Add to conversation
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {/* Search */}
            <button
              onClick={() => {
                onSearch();
                onClose();
              }}
              className="w-full flex items-center space-x-3 p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
              <span>Search</span>
            </button>

            {/* Upload File */}
            <button
              onClick={() => {
                console.log(
                  "Upload button clicked, fileInputRef:",
                  fileInputRef.current
                );
                fileInputRef.current?.click();
              }}
              className="w-full flex items-center space-x-3 p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Paperclip className="w-5 h-5" />
              <span>Upload a file</span>
            </button>

            {/* Take Screenshot */}
            <button
              onClick={() => {
                onScreenshot();
                onClose();
              }}
              className="w-full flex items-center space-x-3 p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Camera className="w-5 h-5" />
              <span>Take a screenshot</span>
            </button>

            {/* Add from GitHub */}
            <button
              onClick={() => {
                onGitHubConnect();
                onClose();
              }}
              className="w-full flex items-center space-x-3 p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Github className="w-5 h-5" />
              <span>Add from GitHub</span>
            </button>

            {/* Add from Google Drive */}
            <button
              onClick={handleGoogleDriveToggle}
              className="w-full flex items-center justify-between p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <FolderOpen className="w-5 h-5" />
                <span>Add from Google Drive</span>
              </div>
              <div className="flex items-center space-x-2">
                {isGoogleDriveConnected ? (
                  <span className="text-green-400 text-xs">Connected</span>
                ) : (
                  <>
                    <span className="text-blue-400 text-xs">Connect</span>
                    <ExternalLink className="w-3 h-3 text-blue-400" />
                  </>
                )}
              </div>
            </button>

            {/* Use a project */}
            <button
              onClick={() => {
                onProjectSelect();
                onClose();
              }}
              className="w-full flex items-center justify-between p-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5" />
                <span>Use a project</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".txt,.md,.pdf,.doc,.docx,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.html,.css,.json,.xml,.csv"
          onFocus={() => console.log("File input focused")}
          onBlur={() => console.log("File input blurred")}
        />
      </div>
    </>
  );
};

export default AttachmentMenu;
