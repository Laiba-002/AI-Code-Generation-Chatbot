import React, { useState, useEffect } from 'react';
import { ChatChunkV2 } from '../types';

interface DebugPanelProps {
  isVisible: boolean;
}

interface ChunkLog {
  id: string;
  timestamp: string;
  chunk: ChatChunkV2;
  type: 'received' | 'processed';
}

const DebugPanel: React.FC<DebugPanelProps> = ({ isVisible }) => {
  const [chunkLogs, setChunkLogs] = useState<ChunkLog[]>([]);
  const [isCapturing, setIsCapturing] = useState(true);

  useEffect(() => {
    if (!isVisible) return;

    // Override console.log to capture chunk logs
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog.apply(console, args);
      
      // Check if this is a chunk-related log
      const logMessage = args[0];
      if (typeof logMessage === 'string' && (logMessage.includes('🔍 V2 Chunk') || logMessage.includes('📝 Streaming') || logMessage.includes('✅ Final Response'))) {
        const chunkData = args[1];
        if (chunkData && typeof chunkData === 'object') {
          const newLog: ChunkLog = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            chunk: chunkData as ChatChunkV2,
            type: logMessage.includes('🔍 V2 Chunk') ? 'received' : 'processed'
          };
          
          setChunkLogs(prev => [...prev.slice(-50), newLog]); // Keep last 50 logs
        }
      }
    };

    return () => {
      console.log = originalLog;
    };
  }, [isVisible]);

  const clearLogs = () => {
    setChunkLogs([]);
  };

  const getChunkTypeIcon = (chunk: ChatChunkV2) => {
    if (chunk.is_complete) return '✅';
    if (chunk.metadata?.is_code_block) return '💻';
    if (chunk.metadata?.content_type === 'html') return '🌐';
    return '📝';
  };

  const getChunkTypeColor = (chunk: ChatChunkV2) => {
    if (chunk.is_complete) return 'text-green-600';
    if (chunk.metadata?.is_code_block) return 'text-blue-600';
    if (chunk.metadata?.content_type === 'html') return 'text-purple-600';
    return 'text-gray-600';
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Debug Panel - Chunk Monitor</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsCapturing(!isCapturing)}
            className={`px-3 py-1 rounded text-sm ${
              isCapturing 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isCapturing ? 'Stop' : 'Start'} Capture
          </button>
          <button
            onClick={clearLogs}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {chunkLogs.length === 0 ? (
        <div className="text-gray-400 text-center py-8">
          <p>No chunks captured yet.</p>
          <p className="text-sm">Send a message to see chunk data.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chunkLogs.map((log) => (
            <div
              key={log.id}
              className="bg-gray-800 border border-gray-600 rounded p-3 text-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className={getChunkTypeColor(log.chunk)}>
                    {getChunkTypeIcon(log.chunk)}
                  </span>
                  <span className="text-white font-medium">
                    {log.chunk.is_complete ? 'Final Chunk' : 'Streaming Chunk'}
                  </span>
                  <span className="text-gray-400">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-gray-400 text-xs">
                  {log.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-400">Content Length:</span>
                  <span className="text-white ml-2">{log.chunk.content?.length || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">Content Type:</span>
                  <span className="text-white ml-2">{log.chunk.metadata?.content_type || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Is Code Block:</span>
                  <span className="text-white ml-2">{log.chunk.metadata?.is_code_block ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Language:</span>
                  <span className="text-white ml-2">{log.chunk.metadata?.language || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Is Executable:</span>
                  <span className="text-white ml-2">{log.chunk.metadata?.is_executable ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total Length:</span>
                  <span className="text-white ml-2">{log.chunk.metadata?.total_length || 'N/A'}</span>
                </div>
              </div>

              {log.chunk.content && (
                <div className="mt-2">
                  <span className="text-gray-400 text-xs">Content Preview:</span>
                  <div className="bg-gray-700 p-2 rounded mt-1 text-xs text-gray-300 font-mono max-h-20 overflow-y-auto">
                    {log.chunk.content.substring(0, 200)}
                    {log.chunk.content.length > 200 && '...'}
                  </div>
                </div>
              )}

              {log.chunk.metadata && (
                <div className="mt-2">
                  <span className="text-gray-400 text-xs">Full Metadata:</span>
                  <pre className="bg-gray-700 p-2 rounded mt-1 text-xs text-gray-300 font-mono max-h-20 overflow-y-auto">
                    {JSON.stringify(log.chunk.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
