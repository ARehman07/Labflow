'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Download, Plus, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/csv';
import {
  createStockItemAction,
  listStockItemsAction,
  moveStockAction,
  setConsumableAction,
  setStockItemActiveAction,
  stockConsumablesAction,
  stockRegisterAction,
  type ConsumableDTO,
  type StockItemDTO,
  type StockMovementDTO,
} from '@/modules/stock/stock.actions';

type Tab = 'ITEMS' | 'REGISTER' | 'USAGE';
type MoveType = 'RECEIVE' | 'ISSUE' | 'ADJUST' | 'RETURN';
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Lab stock: what is on the shelf, the numbered register of every movement,
 * and what each test uses — taken off stock automatically when its sample is
 * collected.
 */
export function StockClient({ initial }: { initial: StockItemDTO[] }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('ITEMS');
  const [items, setItems] = useState(initial);
  const reload = () => listStockItemsAction(true).then(setItems);
  const low = items.filter((i) => i.isActive && i.low).length;
  const expiring = items.filter((i) => i.isActive && i.expiringSoon).length;

  return (
    <div className="page">
      <PageHeader title={t('stock.title')} subtitle={t('stock.subtitle')} back={{ href: '/lab', label: t('lab.title') }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-md">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'ITEMS', label: t('stock.tabItems') },
            { value: 'REGISTER', label: t('stock.tabRegister') },
            { value: 'USAGE', label: t('stock.tabUsage') },
          ]} />
        </div>
        <div className="flex gap-2">
          {low > 0 && <Badge tone="warning">{t('stock.lowN').replace('{n}', String(low))}</Badge>}
          {expiring > 0 && <Badge tone="danger">{t('stock.expiringN').replace('{n}', String(expiring))}</Badge>}
        </div>
      </div>
      {tab === 'ITEMS' && <Items items={items} reload={reload} />}
      {tab === 'REGISTER' && <Register items={items} />}
      {tab === 'USAGE' && <Usage items={items} />}
    </div>
  );
}

function Items({ items, reload }: { items: StockItemDTO[]; reload: () => Promise<unknown> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'pcs', reorderLevel: '', openingQty: '', expiresAt: '' });
  const [moving, setMoving] = useState<{ itemId: string; type: MoveType } | null>(null);
  const [move, setMove] = useState({ quantity: '', department: '', issuedBy: '', receivedBy: '', note: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function addItem() {
    setError(null);
    startSave(async () => {
      const res = await createStockItemAction(form);
      if (!res.ok) { setError(res.error); return; }
      setAdding(false);
      setForm({ name: '', unit: 'pcs', reorderLevel: '', openingQty: '', expiresAt: '' });
      toast('success', t('stock.added'));
      await reload();
    });
  }

  function saveMove() {
    if (!moving) return;
    setError(null);
    startSave(async () => {
      const res = await moveStockAction({ itemId: moving.itemId, type: moving.type, ...move });
      if (!res.ok) { setError(res.error); return; }
      toast('success', t('stock.moved').replace('{n}', String(res.serialNo)).replace('{balance}', qty(res.balanceAfter)));
      setMoving(null);
      setMove({ quantity: '', department: '', issuedBy: '', receivedBy: '', note: '' });
      await reload();
    });
  }

  return (
    <div className="space-y-4">
      {!adding ? (
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('stock.addItem')}</Button>
      ) : (
        <Card className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="st-name">{t('stock.item')}</label>
              <input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('stock.itemPlaceholder')} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="st-unit">{t('stock.unit')}</label>
              <input id="st-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="st-open">{t('stock.opening')}</label>
              <input id="st-open" type="number" min={0} value={form.openingQty} onChange={(e) => setForm({ ...form, openingQty: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label className="label" htmlFor="st-reorder">{t('stock.reorder')}</label>
              <input id="st-reorder" type="number" min={0} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label className="label" htmlFor="st-exp">{t('qc.expires')}</label>
              <DatePicker id="st-exp" value={form.expiresAt} onChange={(v) => setForm({ ...form, expiresAt: v })} />
            </div>
          </div>
          {error && !moving && <p className="note-danger"><Tr text={error} /></p>}
          <div className="flex gap-2">
            <Button onClick={addItem} loading={saving} disabled={form.name.trim().length < 2}>{t('stock.saveItem')}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">{t('stock.item')}</th>
              <th className="px-4 py-2.5 text-end">{t('stock.inStock')}</th>
              <th className="px-4 py-2.5 text-end">{t('stock.reorder')}</th>
              <th className="px-4 py-2.5 text-start">{t('qc.expires')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t('stock.none')}</td></tr>}
            {items.map((i) => (
              <tr key={i.id} className={cn('border-b border-line/70 align-top', !i.isActive && 'opacity-50')}>
                <td className="px-4 py-2">
                  <div className="font-medium text-body">{i.name}</div>
                  <div className="text-xs text-subtle">{i.usedByTests > 0 ? t('stock.usedByN').replace('{n}', String(i.usedByTests)) : i.unit}</div>
                  {moving?.itemId === i.id && (
                    <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input type="number" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} placeholder={moving.type === 'ADJUST' ? t('stock.adjustPlaceholder') : `${t('stock.quantity')} (${i.unit})`} aria-label={t('stock.quantity')} className="field py-2 tabular-nums" autoFocus />
                        {moving.type === 'ISSUE' && (
                          <>
                            <input value={move.department} onChange={(e) => setMove({ ...move, department: e.target.value })} placeholder={t('stock.department')} aria-label={t('stock.department')} className="field py-2" />
                            <input value={move.receivedBy} onChange={(e) => setMove({ ...move, receivedBy: e.target.value })} placeholder={t('stock.receivedBy')} aria-label={t('stock.receivedBy')} className="field py-2" />
                          </>
                        )}
                        <input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder={t('stock.note')} aria-label={t('stock.note')} className={cn('field py-2', moving.type !== 'ISSUE' && 'sm:col-span-2')} />
                      </div>
                      {error && <p className="note-danger"><Tr text={error} /></p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveMove} loading={saving} disabled={!move.quantity}>{t(`stock.type.${moving.type}`)}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setMoving(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                </td>
                <td className={cn('px-4 py-2 text-end font-bold tabular-nums', i.low ? 'text-warn-text' : 'text-strong')}>{qty(i.quantity)} <span className="text-xs font-normal text-subtle">{i.unit}</span></td>
                <td className="px-4 py-2 text-end tabular-nums text-muted">{qty(i.reorderLevel)}</td>
                <td className={cn('px-4 py-2 text-xs', i.expiringSoon ? 'font-semibold text-danger-text' : 'text-muted')}>{i.expiresAt ? new Date(i.expiresAt).toLocaleDateString('en-GB') : '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {(['RECEIVE', 'ISSUE', 'ADJUST'] as const).map((k) => (
                      <Button key={k} size="sm" variant="ghost" onClick={() => { setMoving({ itemId: i.id, type: k }); setError(null); }}>{t(`stock.type.${k}`)}</Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={async () => { await setStockItemActiveAction(i.id, !i.isActive); await reload(); }}>{i.isActive ? t('accounts.hide') : t('accounts.show')}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Register({ items }: { items: StockItemDTO[] }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(dayStr(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(dayStr(new Date()));
  const [itemId, setItemId] = useState('');
  const [rows, setRows] = useState<StockMovementDTO[]>([]);
  const load = useCallback(() => { stockRegisterAction(from, to, itemId).then(setRows).catch(() => setRows([])); }, [from, to, itemId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div><label className="label" htmlFor="sr-from">{t('lab.filterFrom')}</label><DatePicker id="sr-from" value={from} max={to} clearable={false} onChange={(v) => v && setFrom(v)} /></div>
        <div><label className="label" htmlFor="sr-to">{t('lab.filterTo')}</label><DatePicker id="sr-to" value={to} min={from} clearable={false} onChange={(v) => v && setTo(v)} /></div>
        <div className="min-w-48 flex-1">
          <span className="label">{t('stock.item')}</span>
          <Select value={itemId} onChange={setItemId} options={[{ value: '', label: t('stock.allItems') }, ...items.map((i) => ({ value: i.id, label: i.name }))]} />
        </div>
        <Button variant="outline" onClick={() => downloadCsv(`stock-register-${from}-${to}`, ['No.', 'Time', 'Item', 'Type', 'Quantity', 'Balance', 'Department', 'Issued by', 'Received by', 'Note', 'Slip'], rows.map((r) => [r.serialNo, fmtTime(r.at), r.item, t(`stock.type.${r.type}`), r.quantity, r.balanceAfter, r.department, r.issuedBy, r.receivedBy, r.note, r.slipNo]))}>
          <Download className="h-4 w-4" /> {t('rep.export')}
        </Button>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">{t('stock.no')}</th>
              <th className="px-4 py-2.5 text-start">{t('rep.time')}</th>
              <th className="px-4 py-2.5 text-start">{t('stock.item')}</th>
              <th className="px-4 py-2.5 text-start">{t('rep.type')}</th>
              <th className="px-4 py-2.5 text-end">{t('stock.quantity')}</th>
              <th className="px-4 py-2.5 text-end">{t('partners.balance')}</th>
              <th className="px-4 py-2.5 text-start">{t('rep.details')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">{t('rep.empty')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.serialNo} className="border-b border-line/70">
                <td className="px-4 py-2 font-mono text-xs text-subtle">{r.serialNo}</td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(r.at)}</td>
                <td className="px-4 py-2 font-medium">{r.item}</td>
                <td className="px-4 py-2 text-xs">{t(`stock.type.${r.type}`)}</td>
                <td className={cn('px-4 py-2 text-end font-semibold tabular-nums', r.quantity < 0 ? 'text-danger-text' : 'text-ok-text')}>{r.quantity > 0 ? '+' : ''}{qty(r.quantity)}</td>
                <td className="px-4 py-2 text-end tabular-nums">{qty(r.balanceAfter)}</td>
                <td className="px-4 py-2 text-xs text-muted">{[r.department, r.receivedBy && `${t('stock.receivedBy')}: ${r.receivedBy}`, r.note, r.slipNo && `#${r.slipNo}`].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Usage({ items }: { items: StockItemDTO[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<{ rows: ConsumableDTO[]; tests: { id: string; name: string }[] }>({ rows: [], tests: [] });
  const [testId, setTestId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const load = () => stockConsumablesAction().then(setData).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function save(tid: string, iid: string, q: number) {
    const res = await setConsumableAction(tid, iid, q);
    if (!res.ok) { toast('error', res.error); return; }
    await load();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('stock.usageHint')}</p>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><span className="label">{t('rg.test')}</span><Select value={testId} onChange={setTestId} placeholder={t('portalLogins.choose')} options={data.tests.map((x) => ({ value: x.id, label: x.name }))} /></div>
        <div className="min-w-48 flex-1"><span className="label">{t('stock.item')}</span><Select value={itemId} onChange={setItemId} placeholder={t('portalLogins.choose')} options={items.filter((i) => i.isActive).map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} /></div>
        <div><label className="label" htmlFor="su-q">{t('stock.perTest')}</label><input id="su-q" type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="field w-28 tabular-nums" /></div>
        <Button onClick={() => { void save(testId, itemId, Number(quantity)); setItemId(''); }} disabled={!testId || !itemId || !(Number(quantity) > 0)}><Plus className="h-4 w-4" /> {t('culture.add')}</Button>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">{t('rg.test')}</th>
              <th className="px-4 py-2.5 text-start">{t('stock.item')}</th>
              <th className="px-4 py-2.5 text-end">{t('stock.perTest')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">{t('stock.noUsage')}</td></tr>}
            {data.rows.map((r) => (
              <tr key={`${r.testId}:${r.itemId}`} className="border-b border-line/70">
                <td className="px-4 py-2 font-medium">{r.test}</td>
                <td className="px-4 py-2">{r.item}</td>
                <td className="px-4 py-2 text-end tabular-nums">{qty(r.quantity)} <span className="text-xs text-subtle">{r.unit}</span></td>
                <td className="px-4 py-2 text-end"><Button size="sm" variant="ghost" onClick={() => save(r.testId, r.itemId, 0)}>{t('common.remove')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
