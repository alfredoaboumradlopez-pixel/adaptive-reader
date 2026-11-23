/**
 * Server-side in-memory session cache.
 *
 * Stores PDF text + discovery metadata for 30 minutes so per-marker
 * extract calls can retrieve it without re-uploading the file.
 *
 * Runs as a module-level singleton — shared across all route handlers
 * inside the same Node.js process.
 */

export type ArchitectureEntry = {
  sequence: number;
  title: string;
  /** First 10 words of actual body content at this marker's location. */
  anchor: string;
};

// Import from the shared types file; also re-export so server routes only need one import
import type { Depth } from "./knowledge-empire-data";
export type { Depth };

export type SessionData = {
  fullText: string;
  documentArchitecture: ArchitectureEntry[];
  personaProfile: string;
  powerWords: string[];
  markerType: string;
  bookTitle: string;
  bookSlug: string;
  depth: Depth;
  createdAt: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, SessionData>();

function evict(): void {
  const now = Date.now();
  for (const [id, session] of cache) {
    if (now - session.createdAt > SESSION_TTL_MS) cache.delete(id);
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSession(data: Omit<SessionData, "createdAt">): string {
  evict();
  const id = generateId();
  cache.set(id, { ...data, createdAt: Date.now() });
  return id;
}

export function getSession(sessionId: string): SessionData | undefined {
  return cache.get(sessionId);
}
