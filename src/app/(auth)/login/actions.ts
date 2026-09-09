'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/core/auth/auth';

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const tenantCode = String(formData.get('tenantCode') ?? '').trim().toLowerCase();
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await signIn('credentials', { tenantCode, username, password, redirectTo: '/dashboard' });
    return {};
  } catch (error) {
    // signIn throws a redirect on success — that must propagate.
    if (error instanceof AuthError) {
      return { error: 'login.error' };
    }
    throw error;
  }
}
