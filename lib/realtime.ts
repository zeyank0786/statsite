// Simple in-memory store for connected SSE clients
const sessionClients = new Map<string, Set<any>>();

export function registerClient(sessionId: string, response: any) {
  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(response);

  // Return cleanup function
  return () => {
    const clients = sessionClients.get(sessionId);
    if (clients) {
      clients.delete(response);
      if (clients.size === 0) {
        sessionClients.delete(sessionId);
      }
    }
  };
}

export function broadcastUpdate(sessionId: string, data: any) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client: any) => {
    try {
      client.write(message);
    } catch (error) {
      // Client connection closed, will be cleaned up
    }
  });
}
