import { io, Socket } from "socket.io-client";
import { ChatChunk, ChatChunkV2, ModelChange } from "../types";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;

  connect() {
    if (this.socket) {
      return;
    }

    this.socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.isConnected = true;
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.isConnected = false;
    });

    this.socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  sendMessage(
    message: string,
    model: string,
    sessionId: number | null,
    conversationHistory?: Array<{ role: string; content: string }>
  ) {
    if (!this.socket || !this.isConnected) {
      throw new Error("Socket not connected");
    }

    const socketMessage: any = {
      message,
      model,
      history: conversationHistory || [],
    };

    if (sessionId) {
      socketMessage.session_id = sessionId;
    }

    console.log("socketMessage", socketMessage);
    console.log("Message content:", message);
    console.log("Message length:", message.length);
    console.log("Message trimmed:", message.trim());
    console.log("Message trimmed length:", message.trim().length);

    this.socket.emit("chat_message", socketMessage);
  }

  sendMessageV2(
    message: string,
    model: string,
    sessionId: number | null,
    conversationHistory?: Array<{ role: string; content: string }>
  ) {
    if (!this.socket || !this.isConnected) {
      throw new Error("Socket not connected");
    }

    const socketMessage: any = {
      message,
      model,
      history: conversationHistory || [],
    };

    if (sessionId) {
      socketMessage.session_id = sessionId;
    }

    console.log("socketMessageV2", socketMessage);
    console.log("V2 Message content:", message);
    console.log("V2 Message length:", message.length);
    console.log("V2 Message trimmed:", message.trim());
    console.log("V2 Message trimmed length:", message.trim().length);

    this.socket.emit("chat_message_v2", socketMessage);
  }

  onChatResponse(callback: (chunk: ChatChunk) => void) {
    if (!this.socket) return;

    this.socket.on("chat_response_chunk", callback);
  }

  onChatResponseV2(callback: (chunk: ChatChunkV2) => void) {
    if (!this.socket) return;

    this.socket.on("chat_response_chunk_v2", callback);
  }

  onModelChanged(callback: (data: ModelChange) => void) {
    if (!this.socket) return;

    this.socket.on("model_changed", callback);
  }

  onError(callback: (error: { error: string }) => void) {
    if (!this.socket) return;

    this.socket.on("error", callback);
  }

  onConnected(callback: (data: { message: string }) => void) {
    if (!this.socket) return;

    this.socket.on("connected", callback);
  }

  onSessionCreated(
    callback: (data: { session_id: number; model: string }) => void
  ) {
    if (!this.socket) return;

    this.socket.on("session_created", callback);
  }

  changeModel(model: string) {
    if (!this.socket || !this.isConnected) {
      throw new Error("Socket not connected");
    }

    this.socket.emit("model_change", { model });
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const socketService = new SocketService();
export default socketService;
