/**
 * Who may hold an account on this deployment (server-only).
 *
 * `ALLOWED_EMAILS` is a comma-separated, case-insensitive list. Unset or empty
 * allows nobody — fail closed, so a deleted variable never reopens sign-up to
 * strangers spending the app owner's `XAI_API_KEY`.
 *
 * Enforced twice: Better Auth refuses to create any other user
 * (`databaseHooks` in `server.ts`, covering every sign-up path), and
 * `requireUserId` rejects sessions of accounts that existed before the list.
 */
export function isEmailAllowed(
  email: string | null | undefined,
  allowList: string | undefined = process.env.ALLOWED_EMAILS,
): boolean {
  const target = email?.trim().toLowerCase();
  if (!target) return false;
  return (allowList ?? "").split(",").some((entry) => entry.trim().toLowerCase() === target);
}
