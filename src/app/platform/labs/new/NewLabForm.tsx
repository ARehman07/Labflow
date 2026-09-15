'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { createLabAction } from '@/modules/platform/platform.actions';

type Created = { id: string; code: string; ownerUsername: string; password: string };

const toCode = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 30);

export function NewLabForm() {
  const [f, setF] = useState({ name: '', code: '', branchName: 'Main Branch', branchAddress: '', branchPhone: '', ownerName: '', ownerUsername: '' });
  const [codeEdited, setCodeEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createLabAction(f);
      if (res.ok) setCreated(res.lab); else setError(res.error);
    });
  }

  if (created) return <CreatedLab lab={created} name={f.name} />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-strong"><ArrowLeft className="h-4 w-4" /> Labs</Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">New lab</h1>
        <p className="text-sm text-muted">Creates the lab with its Owner, Manager and Staff roles, a first branch, a Cash account and the owner’s account.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <section className="card space-y-3 p-5">
          <h2 className="section-title">The lab</h2>
          <div>
            <label className="label" htmlFor="nl-name">Lab name</label>
            <input id="nl-name" value={f.name} onChange={(e) => set({ name: e.target.value, ...(codeEdited ? {} : { code: toCode(e.target.value) }) })} maxLength={120} placeholder="City Diagnostic Centre" className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="nl-code">Lab code</label>
            <input id="nl-code" value={f.code} onChange={(e) => { setCodeEdited(true); set({ code: e.target.value.toLowerCase() }); }} maxLength={30} placeholder="city-diagnostic" className="field font-mono" required />
            <p className="mt-1 text-xs text-subtle">What the lab’s staff type at sign-in, and what patients use on the portal. It cannot be changed later.</p>
          </div>
        </section>
        <section className="card space-y-3 p-5">
          <h2 className="section-title">First branch</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="nl-branch">Branch name</label>
              <input id="nl-branch" value={f.branchName} onChange={(e) => set({ branchName: e.target.value })} maxLength={80} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="nl-addr">Address</label>
              <input id="nl-addr" value={f.branchAddress} onChange={(e) => set({ branchAddress: e.target.value })} maxLength={200} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="nl-phone">Phone</label>
              <input id="nl-phone" value={f.branchPhone} onChange={(e) => set({ branchPhone: e.target.value })} maxLength={40} className="field" />
            </div>
          </div>
        </section>
        <section className="card space-y-3 p-5">
          <h2 className="section-title">Owner</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nl-owner">Owner’s name</label>
              <input id="nl-owner" value={f.ownerName} onChange={(e) => set({ ownerName: e.target.value })} maxLength={120} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="nl-user">Owner username</label>
              <input id="nl-user" value={f.ownerUsername} onChange={(e) => set({ ownerUsername: e.target.value.toLowerCase() })} maxLength={40} placeholder="owner" className="field font-mono" required />
            </div>
          </div>
          <p className="text-xs text-subtle">A one-time password is made for the owner and shown once. They choose their own at first sign-in, then add their staff in Admin → Users.</p>
        </section>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <Link href="/platform" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-strong">Cancel</Link>
          <button type="submit" disabled={pending} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60">
            {pending ? 'Creating…' : 'Create lab'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreatedLab({ lab, name }: { lab: Created; name: string }) {
  const signIn = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ok-soft text-ok-text"><Check className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-extrabold text-strong">{name} is ready</h1>
            <p className="text-sm text-muted">Send the owner these details. The password is shown only now.</p>
          </div>
        </div>
        <dl className="divide-y divide-line rounded-xl border border-line">
          <Row label="Sign in at" value={signIn} />
          <Row label="Lab code" value={lab.code} mono />
          <Row label="Username" value={lab.ownerUsername} mono />
          <Row label="One-time password" value={lab.password} mono strong />
        </dl>
        <p className="text-xs text-subtle">The owner must choose a new password at first sign-in.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/platform" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-strong">All labs</Link>
          <Link href={`/platform/labs/${lab.id}`} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Open lab</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <dt className="w-36 shrink-0 text-xs font-medium text-subtle">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all text-sm ${mono ? 'font-mono' : ''} ${strong ? 'font-bold text-strong' : 'text-body'}`}>{value}</dd>
      <button
        type="button"
        onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        aria-label={`Copy ${label}`}
        className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-strong"
      >
        {copied ? <Check className="h-4 w-4 text-ok-text" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
