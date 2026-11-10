// Types for the parts of supabase-auth.mjs used by TypeScript modules.
export interface SupabaseClaims { sub: string; email?: string; [claim: string]: unknown }
export function normalizeSupabaseUrl(value: unknown): string | null;
export function createSupabaseTokenVerifier(options: { supabaseUrl: string; fetchImpl?: typeof fetch }): {
  verify(token: string): Promise<SupabaseClaims | null>;
};
export function readBearerToken(request: Request): string | null;
export function isServiceRoleKey(serviceKey: unknown): boolean;
