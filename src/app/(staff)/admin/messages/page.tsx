import { can } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { emailConfigured, smsConfigured } from '@/lib/messaging';
import { messagesService } from '@/modules/messages/messages.service';
import { listMessageLogAction } from '@/modules/messages/messages.actions';
import { MessagesClient } from './MessagesClient';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const [settings, manage] = await Promise.all([can('settings.manage'), can('admin.manage')]);
  if (!settings && !manage) return <AccessDenied area="admin" />;
  const db = await tenantDb();
  const [templates, log, tenant] = await Promise.all([
    messagesService.templates(),
    listMessageLogAction({}),
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true, code: true } }),
  ]);
  return (
    <MessagesClient
      canEdit={settings}
      labName={tenant?.name ?? ''}
      labCode={tenant?.code ?? ''}
      sms={smsConfigured()}
      email={emailConfigured()}
      initialTemplates={templates}
      initialLog={log}
    />
  );
}
