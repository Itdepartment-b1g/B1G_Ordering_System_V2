import { requireAuthUser } from './requireAuthUser';
import { requireRole } from './requireRole';

export async function requireExecutive(authorization?: string) {
  const user = await requireAuthUser(authorization);
  await requireRole(user, 'executive');
  return user;
}
