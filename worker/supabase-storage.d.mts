// Types for the parts of supabase-storage.mjs used by TypeScript modules.
export interface StorageBucket {
  put(key: string, bytes: ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }): Promise<{ key: string }>;
  get(key: string): Promise<{ body: ReadableStream | null; size?: number; httpMetadata: { contentType: string } } | null>;
  delete(key: string): Promise<void>;
}
export const DOCUMENTS_BUCKET: string;
export function createSupabaseStorageBucket(options: { supabaseUrl: string; serviceKey: string; bucket?: string; fetchImpl?: typeof fetch }): StorageBucket;
