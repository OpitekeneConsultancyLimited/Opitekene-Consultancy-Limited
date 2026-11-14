// Types for the parts of admin-access.mjs used by TypeScript modules.
export const MFA_REQUIRED_MESSAGE: string;
export function isStrongSession(claims: { [claim: string]: unknown } | null | undefined): boolean;
export function privilegedMfaRequired(env: { PRIVILEGED_MFA_REQUIRED?: string } | null | undefined): boolean;
export function logSecurityEvent(db: unknown, event: {
  type: string; outcome: "allowed" | "refused" | "error"; userId?: string | null; email?: string | null;
  route?: string; details?: Record<string, unknown>; at?: string;
}): Promise<boolean>;
