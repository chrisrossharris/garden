import { ensureUserByClerkId } from '@/lib/services/users';

export async function requireAppUser(locals: App.Locals) {
  const auth = locals.auth?.();
  if (!auth?.userId) return null;
  return ensureUserByClerkId(auth.userId);
}
