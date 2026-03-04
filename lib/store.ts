/**
 * =============================================================================
 * File-Backed Data Store (lib/store.ts)
 * =============================================================================
 *
 * Purpose:
 * --------
 * This module implements a simple JSON-file persistence layer for the app.
 * It provides CRUD-style helpers for:
 *   - users (anonymous or cookie-based)
 *   - user profiles (preferences used by the LLM layer)
 *   - session outputs (generated reports + feedback)
 *   - knowledge documents (RAG/source docs scoped to a user)
 *
 * Data is stored at:
 *   /data/store.json   (resolved from process.cwd())
 *
 * User information is stored locally rather than using a database or external service.
 * This is suitable for development and small-scale usage for a class project
 *
 * ---------------------------------------------------------------------------
 * Stored Shape (DataStore):
 * ---------------------------------------------------------------------------
 * {
 *   users:    StoredUser[];                  // known users (id + createdAt)
 *   profiles: Record<userId, UserProfile>;   // profile keyed by user id
 *   sessions: StoredSessionOutput[];         // newest-first session outputs
 *   docs:     KnowledgeDocument[];           // knowledge docs for RAG
 * }
 *
 * ---------------------------------------------------------------------------
 * Dependencies:
 * ---------------------------------------------------------------------------
 * - fs/promises (mkdir, readFile, writeFile)
 *     → Async file I/O for reading/writing the JSON store and ensuring folders
 *
 * - path
 *     → Builds a cross-platform path to /data/store.json
 *
 * - crypto
 *     → Generates UUIDs for new users and knowledge documents (crypto.randomUUID)
 *
 * - Types (./types)
 *     → Defines KnowledgeDocument, StoredSessionOutput, StoredUser, UserProfile
 *
 * ---------------------------------------------------------------------------
 * Internal Helpers:
 * ---------------------------------------------------------------------------
 * ensureStore(): Promise<DataStore>
 *   - Reads DATA_PATH and parses JSON into a DataStore.
 *   - If the file or directory does not exist (or read fails), it:
 *       1) creates the /data directory (recursive)
 *       2) seeds a new store.json with empty collections
 *       3) returns the seeded DataStore
 *   - Output:
 *       DataStore (always valid/initialized)
 *
 * saveStore(store: DataStore): Promise<void>
 *   - Serializes the provided DataStore and writes it to DATA_PATH.
 *   - Output:
 *       void (persists changes to disk)
 *
 * ---------------------------------------------------------------------------
 * Exported API (Methods + Inputs/Outputs):
 * ---------------------------------------------------------------------------
 * getOrCreateUser(userId?: string): Promise<StoredUser>
 *   - Loads the store and attempts to find a StoredUser by id.
 *   - If not found, creates a new StoredUser with:
 *       - id: provided userId OR a new UUID
 *       - createdAt: ISO timestamp
 *     then persists it.
 *   - Inputs:
 *       userId?: string
 *   - Output:
 *       StoredUser
 *
 * getProfile(userId: string): Promise<UserProfile | null>
 *   - Loads the store and returns the profile for the given userId.
 *   - Inputs:
 *       userId: string
 *   - Output:
 *       UserProfile if present, otherwise null
 *
 * saveProfile(userId: string, profile: UserProfile): Promise<void>
 *   - Loads the store, overwrites/sets profiles[userId] = profile, and persists.
 *   - Inputs:
 *       userId: string
 *       profile: UserProfile
 *   - Output:
 *       void
 *
 * saveSession(output: StoredSessionOutput): Promise<void>
 *   - Loads the store, inserts the new session at the front (newest-first),
 *     and persists.
 *   - Inputs:
 *       output: StoredSessionOutput
 *   - Output:
 *       void
 *
 * listSessions(userId: string): Promise<StoredSessionOutput[]>
 *   - Loads the store and returns all sessions belonging to the given userId.
 *   - Inputs:
 *       userId: string
 *   - Output:
 *       StoredSessionOutput[] (filtered)
 *
 * updateSessionFeedback(
 *   sessionId: string,
 *   rating: "up" | "down",
 *   feedback: string
 * ): Promise<StoredSessionOutput | null>
 *   - Loads the store, finds a session by id, and (if found) sets:
 *       - session.rating = rating
 *       - session.feedback = feedback
 *     then persists.
 *   - Inputs:
 *       sessionId: string
 *       rating: "up" | "down"
 *       feedback: string
 *   - Output:
 *       Updated StoredSessionOutput, or null if session is not found
 *
 * addKnowledgeDoc(doc: Omit<KnowledgeDocument, "id" | "createdAt">): Promise<KnowledgeDocument>
 *   - Loads the store, creates a full KnowledgeDocument by adding:
 *       - id: UUID
 *       - createdAt: ISO timestamp
 *     then appends it to docs and persists.
 *   - Inputs:
 *       doc: KnowledgeDocument without id/createdAt
 *   - Output:
 *       KnowledgeDocument (the created, persisted doc)
 *
 * listKnowedgeDocuments(userId: string): Promise<KnowledgeDocument[]>
 *   - Loads the store and returns all knowledge docs for the given userId.
 *   - Note: function name is spelled "listKnowedgeDocuments" (missing 'l' in Knowledge).
 *   - Inputs:
 *       userId: string
 *   - Output:
 *       KnowledgeDocument[] (filtered)
 *
 * ---------------------------------------------------------------------------
 * Notes / Limitations:
 * ---------------------------------------------------------------------------
 * - Concurrency: multiple writes at the same time can race and overwrite data
 *   (no locking/transactions). Consider a mutex, atomic write strategy, or a DB.
 * - Error handling: ensureStore() treats any read/parse error as “initialize new store”,
 *   which could overwrite recovery scenarios if the JSON becomes corrupted.
 * - Performance: full file read/write on every operation; fine for small data,
 *   not ideal for large or high-traffic usage.
 *
 * =============================================================================
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  KnowledgeDocument,
  StoredSessionOutput,
  StoredUser,
  UserProfile,
} from "./types";

interface DataStore {
  users: StoredUser[]; //array of users with id and createdAt
  profiles: Record<string, UserProfile>; //mapping of userId to a user's profile/preferences
  sessions: StoredSessionOutput[]; //a list of saved outputs (AI reports, etc) tied to a userId
  docs: KnowledgeDocument[]; //a list of knowledge documents for RAG tied to a userId
}

const DATA_PATH = path.join(process.cwd(), "data", "store.json");

//helper to ensure the file exists
//if anything goes wrong it will create a new file with the correct shape and return it
async function ensureStore(): Promise<DataStore> {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as DataStore;
  } catch (e) {
    await mkdir(path.dirname(DATA_PATH), { recursive: true }); //recursive in case /data doesn't exist
    const seed: DataStore = { users: [], profiles: {}, sessions: [], docs: [] };
    await writeFile(DATA_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
}

//write the database back to the disk
async function saveStore(store: DataStore) {
  await writeFile(DATA_PATH, JSON.stringify(store, null, 2));
}

export async function getOrCreateUser(userId?: string): Promise<StoredUser> {
  const store = await ensureStore();
  let user = store.users.find((u) => u.id === userId);
  if (!user) {
    user = {
      id: userId || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    await saveStore(store);
  }
  return user;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const store = await ensureStore();
  return store.profiles[userId] || null;
}

export async function saveProfile(
  userId: string,
  profile: UserProfile,
): Promise<void> {
  const store = await ensureStore();
  store.profiles[userId] = profile;
  await saveStore(store);
}

export async function saveSession(output: StoredSessionOutput) {
  const store = await ensureStore();
  store.sessions.unshift(output);
  await saveStore(store);
}

export async function listSessions(userId: string) {
  const store = await ensureStore();
  return store.sessions.filter((s) => s.userId === userId);
}

export async function updateSessionFeedback(
  sessionId: string,
  rating: "up" | "down",
  feedback?: string,
) {
  const store = await ensureStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  session.rating = rating;
  session.feedback = feedback;
  await saveStore(store);
  return session;
}

export async function addKnowledgeDoc(
  doc: Omit<KnowledgeDocument, "id" | "createdAt">,
) {
  const store = await ensureStore();
  const created: KnowledgeDocument = {
    ...doc,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store.docs.push(created);
  await saveStore(store);
  return created;
}

export async function listKnowedgeDocuments(userId: string) {
  const store = await ensureStore();
  return store.docs.filter((d) => d.userId === userId);
}
