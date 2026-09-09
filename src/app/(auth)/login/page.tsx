'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { AuthShell } from '@/components/layout/AuthShell';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" loading={pending}>
      {t('login.submit')}
    </Button>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <AuthShell title={t('app.name')} subtitle={t('app.tagline')}>
      <h2 className="mb-5 text-lg font-semibold text-body">{t('login.title')}</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="tenantCode" className="label">{t('login.tenantCode')}</label>
          <input
            id="tenantCode"
            name="tenantCode"
            autoComplete="organization"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="field"
          />
          <p className="mt-1 text-xs text-muted">{t('login.tenantCodeHint')}</p>
        </div>

        <div>
          <label htmlFor="username" className="label">{t('login.username')}</label>
          <input id="username" name="username" autoComplete="username" required className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">{t('login.password')}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        {state.error && (
          <p className="animate-fade-in rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{t(state.error)}</p>
        )}
        <SubmitButton />
      </form>
    </AuthShell>
  );
}
