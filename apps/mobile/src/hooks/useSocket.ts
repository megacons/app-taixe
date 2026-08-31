import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return globalSocket;
}

interface Options {
  rooms?: string[];                                    // emit events to join rooms
  events?: Record<string, (...args: any[]) => void>;  // event → handler
  userId?: string;                                     // join personal room
}

export function useSocket({ rooms = [], events = {}, userId }: Options = {}) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      rooms.forEach(room => socket.emit(room));
      if (userId) socket.emit('join:user', userId);
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);

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
  }, [userId]);

  return socketRef;
}
