import { can } from '@/core/rbac/guard';
import { AdminTile } from './AdminTile';

/**
 * Grouped by the kind of decision being made, because "add a test" and "set the
 * family-card discount" are not the same kind of act and are not held by the
 * same people. Policy is owner-only and sits apart for that reason.
 */
export default async function AdminPage() {
  const manage = await can('admin.manage');
  const users = await can('user.manage');
  const settings = await can('settings.manage');

  if (!manage && !users && !settings) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have admin access.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">Admin</h1>
        <p className="mt-0.5 text-sm text-muted">Set up the catalogue, the people and the rules.</p>
      </div>

      {settings && (
        <Group title="Policy">
          <AdminTile href="/admin/policy" icon="billing" titleKey="admin.policy" descKey="admin.policyDesc" />
          <AdminTile href="/admin/letterhead" icon="print" titleKey="admin.letterhead" descKey="admin.letterheadDesc" />
        </Group>
      )}

      {(users || manage) && (
        <Group title="People & access">
          {users && <AdminTile href="/admin/users" icon="admin" titleKey="admin.users" descKey="admin.usersDesc" />}
          {users && <AdminTile href="/admin/roles" icon="approve" titleKey="admin.roles" descKey="admin.rolesDesc" />}
          {manage && <AdminTile href="/admin/doctors" icon="approve" titleKey="admin.doctors" descKey="admin.doctorsDesc" />}
        </Group>
      )}

      {manage && (
        <Group title="Catalogue">
          <AdminTile href="/admin/tests" icon="lab" titleKey="admin.tests" descKey="admin.testsDesc" />
          <AdminTile href="/admin/departments" icon="insights" titleKey="admin.departments" descKey="admin.departmentsDesc" />
          <AdminTile href="/admin/branches" icon="billing" titleKey="admin.branches" descKey="admin.branchesDesc" />
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-subtle">{title}</h2>
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
