'use client';

import { useState, useTransition } from 'react';
import { Banknote, CreditCard, Plus, Smartphone } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import {
  createPaymentAccountAction,
  listPaymentAccountsAction,
  setPaymentAccountActiveAction,
  type PaymentAccountDTO,
} from '@/modules/accounts/accounts.actions';

const ICON = { CASH: Banknote, CARD: CreditCard, ONLINE: Smartphone } as const;

/**
 * The tills and accounts money goes into. Reception and Billing pick one when
 * taking or returning money, so the day can be counted per account. An account
 * is hidden rather than deleted: old payments still name it.
 */
export function AccountsClient({ initial }: { initial: PaymentAccountDTO[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [accounts, setAccounts] = useState(initial);
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'ONLINE'>('ONLINE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => listPaymentAccountsAction(true).then(setAccounts);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createPaymentAccountAction({ name, method });
      if (res.ok) { setName(''); toast('success', t('accounts.added')); await reload(); }
      else setError(res.error);
    });
  }

  async function toggle(a: PaymentAccountDTO) {
    setBusy(a.id);
    const res = await setPaymentAccountActiveAction(a.id, !a.isActive);
    setBusy(null);
    if (res.ok) await reload();
    else toast('error', res.error);
  }

  return (
    <div className="page">
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="acc-name">{t('accounts.name')}</label>
            <input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) add(); }}
              placeholder={t('accounts.namePlaceholder')}
              className="field"
            />
          </div>
          <div>
            <span className="label">{t('accounts.method')}</span>
            <Segmented
              value={method}
              onChange={setMethod}
              ariaLabel={t('accounts.method')}
              options={[
                { value: 'CASH', label: t('billing.cash') },
                { value: 'CARD', label: t('billing.card') },
                { value: 'ONLINE', label: t('billing.online') },
              ]}
            />
          </div>
          <Button onClick={add} loading={isPending} disabled={name.trim().length < 2}>
            <Plus className="h-4 w-4" /> {t('accounts.add')}
          </Button>
        </div>
        {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
      </Card>

      <Card className="p-2">
        <ul className="space-y-0.5">
          {accounts.map((a) => {
            const Icon = ICON[a.method];
            return (
              <li key={a.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2', !a.isActive && 'opacity-60')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-body">{a.name}</span>
                  <span className="text-xs text-subtle">{t(`billing.${a.method.toLowerCase()}`)}</span>
                </span>
                {!a.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                <Button variant="ghost" size="sm" onClick={() => toggle(a)} loading={busy === a.id}>
                  {a.isActive ? t('accounts.hide') : t('accounts.show')}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
