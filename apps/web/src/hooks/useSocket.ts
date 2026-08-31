import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = '/';  // same origin — Vite proxy handles it

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return globalSocket;
}

interface UseSocketOptions {
  /** Rooms to join on connect */
  rooms?: string[];
  /** Event listeners: { eventName: handler } */
  events?: Record<string, (...args: any[]) => void>;
}

export function useSocket({ rooms = [], events = {} }: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      rooms.forEach(room => socket.emit(room)); // e.g. 'join:admin'
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);

    // Register event listeners
    Object.entries(events).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      socket.off('connect', onConnect);
      Object.entries(events).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { emit };
}
