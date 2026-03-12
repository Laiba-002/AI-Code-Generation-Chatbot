export interface ChatContent {
  text: string;
  attachments: string[]; // or whatever type your attachments are
   id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string ;
  timestamp: Date;
  model?: string;
  attachments:[]; 
  metadata?: ChatChunkMetadata; // Add metadata support for v2 handler
}

export interface Model {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface ChatResponse {
  response: string;
  model: string;
  timestamp: string;
}

export interface ChatChunk {
  content: string;
  model: string;
  is_complete: boolean;
  full_response?: string;
}

export interface ChatChunkMetadata {
  content_type: 'text' | 'html' | 'css' | 'javascript' | 'code';
  language?: string;
  file_extension?: string;
  is_code_block: boolean;
  is_executable: boolean;
  requires_syntax_highlighting: boolean;
  total_length?: number;
}

export interface ChatChunkV2 {
  content: string;
  model: string;
  is_complete: boolean;
  full_response?: string;
  metadata: ChatChunkMetadata;
  timestamp: string;
}

export interface SocketMessage {
  message: string;
  model: string;
  history: { role: 'user' | 'assistant'; content: string; }[];
}

export interface ModelChange {
  model: string;
}

export interface HealthCheck {
  status: string;
  ollama_connected: boolean;
  timestamp: string;
} 