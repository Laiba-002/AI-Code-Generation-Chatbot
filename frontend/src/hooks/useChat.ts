// import { useState, useEffect, useCallback } from 'react';
// import { Message, Model, ChatChunk } from '../types';
// import { socketService } from '../utils/socket';
// import api from '../utils/api';

// export const useChat = () => {
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [models, setModels] = useState<Model[]>([]);
//   const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:8b');
//   const [isConnected, setIsConnected] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   // Initialize socket connection and fetch models
//   useEffect(() => {
//     const initializeChat = async () => {
//       try {
//         // Connect to WebSocket
//         socketService.connect();

//         // Set up socket event listeners
//         socketService.onConnected(() => {
//           setIsConnected(true);
//           setError(null);
//         });

//         socketService.onError((error) => {
//           setError(error.error);
//           setIsLoading(false);
//         });

//         socketService.onChatResponse((chunk: ChatChunk) => {
//           if (chunk.is_complete) {
//             // Just mark loading as complete, don't add a new message
//             setIsLoading(false);
//           } else {
//             // Update the last message with streaming content
//             setMessages(prev => {
//               const newMessages = [...prev];
//               const lastMessage = newMessages[newMessages.length - 1];
//               if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content !== undefined) {
//                 lastMessage.content += chunk.content;
//               }
//               return newMessages;
//             });
//         });

//         // Fetch available models
//         const availableModels = await api.getModels();
//         setModels(availableModels);

//         if (availableModels.length > 0) {
//           setSelectedModel(availableModels[0].id);
//         }

//       } catch (err) {
//         console.error('Failed to initialize chat:', err);
//         setError('Failed to connect to server');
//       }
//     };

//     initializeChat();

//     // Cleanup on unmount
//     return () => {
//       socketService.disconnect();
//     };
//   }, []);

//   // Send message function
//   const sendMessage = useCallback(async (content: string) => {
//     if (!content.trim() || isLoading) return;

//     const userMessage: Message = {
//       id: Date.now().toString(),
//       role: 'user',
//       content: content.trim(),
//       timestamp: new Date()
//     };

//     setMessages(prev => [...prev, userMessage]);
//     setIsLoading(true);
//     setError(null);

//     try {
//       // Add an initial assistant message for streaming
//       const assistantMessage: Message = {
//         id: (Date.now() + 1).toString(),
//         role: 'assistant',
//         content: '',
//         timestamp: new Date(),
//         model: selectedModel
//       };
//       setMessages(prev => [...prev, assistantMessage]);

//       // Send message via WebSocket
//       socketService.sendMessage(content.trim(), selectedModel, messages);
//     } catch (err) {
//       console.error('Failed to send message:', err);
//       setError('Failed to send message');
//       setIsLoading(false);
//     }
//   }, [messages, selectedModel, isLoading]);

//   // Change model function
//   const changeModel = useCallback((modelId: string) => {
//     setSelectedModel(modelId);
//     try {
//       socketService.changeModel(modelId);
//     } catch (err) {
//       console.error('Failed to change model:', err);
//     }
//   }, []);

//   // Clear chat function
//   const clearChat = useCallback(() => {
//     setMessages([]);
//     setError(null);
//   }, []);

//   // New chat function
//   const newChat = useCallback(() => {
//     clearChat();
//   }, [clearChat]);

//   return {
//     messages,
//     isLoading,
//     models,
//     selectedModel,
//     isConnected,
//     error,
//     sendMessage,
//     changeModel,
//     clearChat,
//     newChat
//   };
// };

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatChunk, ChatChunkV2, Message, Model } from "../types";
import api from "../utils/api";
import { socketService } from "../utils/socket";
// const llmModels: Model[] = [
//   {
//     id: "gpt-4",
//     name: "GPT-4",
//     description:
//       "OpenAI’s most advanced large language model, great for a wide range of natural language tasks.",
//     category: "LLM",
//   },
//   {
//     id: "gpt-3.5-turbo",
//     name: "GPT-3.5 Turbo",
//     description:
//       "A faster and cheaper variant of GPT-3.5 optimized for chat-based applications.",
//     category: "LLM",
//   },
//   {
//     id: "llama-2-13b",
//     name: "LLaMA 2 (13B)",
//     description:
//       "Meta’s open-weight large language model designed for research and commercial use.",
//     category: "LLM",
//   },
//   {
//     id: "bert-large",
//     name: "BERT Large",
//     description:
//       "Google’s transformer-based LLM primarily used for language understanding and classification tasks.",
//     category: "LLM",
//   },
// ];

export const useChat = (onSessionCreated?: (sessionId: number) => void) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen2.5:8b");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [useV2Handler, setUseV2Handler] = useState<boolean>(true); // Enable V2 handler by default for metadata support
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);
  const [modelsLoaded, setModelsLoaded] = useState<boolean>(false);

  // Track current streaming response
  const currentResponseRef = useRef<string>("");
  const currentMessageIdRef = useRef<string>("");
  const currentMetadataRef = useRef<any>(null);

  // Initialize socket connection and fetch models only when authenticated
  useEffect(() => {
    // Only initialize if onSessionCreated callback is provided (user is authenticated)
    if (!onSessionCreated) {
      return;
    }

    const initializeChat = async () => {
      try {
        // Connect to WebSocket
        socketService.connect();

        // Set up socket event listeners
        socketService.onConnected(() => {
          setIsConnected(true);
          setError(null);
        });

        socketService.onError((error) => {
          setError(error.error);
          setIsLoading(false);
          // Reset streaming refs on error
          currentResponseRef.current = "";
          currentMessageIdRef.current = "";
          currentMetadataRef.current = null;
        });

        socketService.onChatResponse((chunk: ChatChunk) => {
          if (chunk.is_complete) {
            // Use the complete response from the chunk if available
            const finalContent =
              chunk.full_response || currentResponseRef.current;

            // Update the message with final content
            setMessages((prev) => {
              const newMessages = [...prev];
              const messageIndex = newMessages.findIndex(
                (msg) => msg.id === currentMessageIdRef.current
              );
              if (messageIndex !== -1) {
                newMessages[messageIndex] = {
                  ...newMessages[messageIndex],
                  content: finalContent,
                };
              }
              return newMessages;
            });

            setIsLoading(false);
            // Reset streaming refs
            currentResponseRef.current = "";
            currentMessageIdRef.current = "";
            currentMetadataRef.current = null;
          } else {
            // Accumulate content
            currentResponseRef.current += chunk.content;

            // Update the UI with streaming content
            setMessages((prev) => {
              const newMessages = [...prev];
              const messageIndex = newMessages.findIndex(
                (msg) => msg.id === currentMessageIdRef.current
              );
              if (messageIndex !== -1) {
                newMessages[messageIndex] = {
                  ...newMessages[messageIndex],
                  content: currentResponseRef.current,
                };
              }
              return newMessages;
            });
          }
        });

        // Set up v2 handler listener
        socketService.onChatResponseV2((chunk: ChatChunkV2) => {
          if (chunk.is_complete) {
            setIsLoading(false);
            setIsGeneratingCode(false);
            // Reset streaming refs on completion
            currentResponseRef.current = "";
            currentMessageIdRef.current = "";
            currentMetadataRef.current = null;
          } else {
            // Update the current response
            currentResponseRef.current += chunk.content;
            if (chunk.metadata) {
              currentMetadataRef.current = chunk.metadata;
            }

            // Check if we're generating code
            if (
              chunk.metadata?.content_type === "code" ||
              chunk.metadata?.language
            ) {
              setIsGeneratingCode(true);
            }

            // Update the current message with streaming content
            setMessages((prev) => {
              const newMessages = [...prev];
              const messageIndex = newMessages.findIndex(
                (msg) => msg.id === currentMessageIdRef.current
              );
              if (messageIndex !== -1) {
                newMessages[messageIndex] = {
                  ...newMessages[messageIndex],
                  content: currentResponseRef.current,
                  metadata: chunk.metadata, // Update metadata as it streams
                };
              }
              return newMessages;
            });
          }
        });

        // Handle session creation events
        socketService.onSessionCreated(
          (data: { session_id: number; model: string }) => {
            console.log("Session created via WebSocket:", data);
            setCurrentSessionId(data.session_id);
            onSessionCreated?.(data.session_id);
          }
        );

        // Fetch available models
        const availableModels = await api.getModels();
        // const availableModels = llmModels;
        setModels(availableModels);
        setModelsLoaded(true);

        if (availableModels.length > 0) {
          setSelectedModel(availableModels[0].id);
        }
      } catch (err) {
        console.error("Failed to initialize chat:", err);
        setError("Failed to connect to server");
      }
    };

    initializeChat();

    // Cleanup on unmount
    return () => {
      socketService.disconnect();
    };
  }, [onSessionCreated]);

  // Send message function
  const sendMessage = useCallback(
    async (content: any) => {
      // Handle both string and object formats
      const messageText =
        typeof content === "string" ? content : content.text || "";
      console.log("sendMessage called with:", {
        content,
        messageText,
        trimmed: messageText.trim(),
      });
      if (!messageText.trim() || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: messageText.trim(),
        timestamp: new Date(),
        attachments:
          typeof content === "object" ? content.attachments || [] : [],
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        // Create a new session if none exists
        let sessionIdToUse = currentSessionId;
        if (!currentSessionId) {
          console.log("No current session, creating new session...");
          const sessionResponse = await api.createSession(selectedModel);
          if (sessionResponse.success) {
            sessionIdToUse = sessionResponse.session_id;
            setCurrentSessionId(sessionResponse.session_id);
            console.log("New session created:", sessionResponse.session_id);
            onSessionCreated?.(sessionResponse.session_id);
          } else {
            console.error("Failed to create session:", sessionResponse);
            return; // Don't proceed if session creation failed
          }
        }

        console.log("🔍 Using session ID for message:", sessionIdToUse);

        // Add an initial assistant message for streaming
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "",
          timestamp: new Date(),
          model: selectedModel,
          attachments: [],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Set the current message ID for streaming updates
        currentMessageIdRef.current = assistantMessage.id;

        // Send message via WebSocket
        if (useV2Handler) {
          // Format conversation history for socket service
          const conversationHistory = messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));
          console.log("🔍 Sending V2 message with session ID:", sessionIdToUse);
          socketService.sendMessageV2(
            messageText.trim(),
            selectedModel,
            sessionIdToUse,
            conversationHistory
          );
        } else {
          // Format conversation history for socket service
          const conversationHistory = messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));
          console.log("🔍 Sending V1 message with session ID:", sessionIdToUse);
          socketService.sendMessage(
            messageText.trim(),
            selectedModel,
            sessionIdToUse,
            conversationHistory
          );
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setError("Failed to send message");
        setIsLoading(false);
        // Reset streaming refs on error
        currentResponseRef.current = "";
        currentMessageIdRef.current = "";
        currentMetadataRef.current = null;
      }
    },
    [
      messages,
      selectedModel,
      isLoading,
      useV2Handler,
      currentSessionId,
      onSessionCreated,
    ]
  );

  // Toggle between v1 and v2 handlers
  const toggleV2Handler = useCallback(() => {
    setUseV2Handler((prev) => !prev);
  }, []);

  // Change model function
  const changeModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    try {
      socketService.changeModel(modelId);
    } catch (err) {
      console.error("Failed to change model:", err);
    }
  }, []);

  // Clear chat function
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    // Reset streaming refs
    currentResponseRef.current = "";
    currentMessageIdRef.current = "";
    currentMetadataRef.current = null;
  }, []);

  // New chat function
  const newChat = useCallback(async () => {
    clearChat();
    // Don't set currentSessionId to null here - let createNewSession handle it
  }, [clearChat]);

  // Load session messages
  const loadSession = useCallback(async (sessionId: number) => {
    try {
      console.log("Loading session:", sessionId);
      setIsLoading(true); // Show loading state
      setError(null); // Clear any previous errors

      const response = await api.getSessionMessages(sessionId);
      console.log("Session response:", response);
      if (response.success) {
        const sessionMessages: Message[] = response.messages.map(
          (msg: any) => ({
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            model: msg.model_used,
            attachments: msg.attachments || [],
          })
        );
        console.log("Loaded messages:", sessionMessages);
        setMessages(sessionMessages);
        setCurrentSessionId(sessionId);
        setError(null);
      } else {
        setError("Failed to load chat session");
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      setError("Failed to load chat session");
    } finally {
      setIsLoading(false); // Always clear loading state
    }
  }, []);

  // Create new session
  const createNewSession = useCallback(async () => {
    try {
      console.log("Creating new session with model:", selectedModel);
      const response = await api.createSession(selectedModel);
      console.log("Create session response:", response);
      if (response.success) {
        setCurrentSessionId(response.session_id);
        clearChat(); // Clear messages after setting session ID
        console.log("New session created:", response.session_id);
      }
    } catch (err) {
      console.error("Failed to create session:", err);
      setError("Failed to create new chat session");
    }
  }, [selectedModel, clearChat]);
  // Stop generation function
  const stopGeneration = useCallback(async () => {
    try {
      // Only call the API if we have a valid session ID
      if (currentSessionId) {
        await api.stopGeneration(currentSessionId);
      }
      setIsLoading(false);
      setIsGeneratingCode(false);
      // Reset streaming refs
      currentResponseRef.current = "";
      currentMessageIdRef.current = "";
      currentMetadataRef.current = null;
    } catch (err) {
      console.error("Failed to stop generation:", err);
      setError("Failed to stop model generation");
    }
  }, [currentSessionId]);
  return {
    messages,
    isLoading,
    models,
    selectedModel,
    isConnected,
    error,
    currentSessionId,
    useV2Handler,
    isGeneratingCode,
    modelsLoaded,
    sendMessage,
    changeModel,
    clearChat,
    newChat,
    loadSession,
    createNewSession,
    toggleV2Handler,
    stopGeneration,
  };
};
