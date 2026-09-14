import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listStockItemsAction } from '@/modules/stock/stock.actions';
import { StockClient } from './StockClient';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  if (!(await featureOn('lab.stock'))) return <FeatureOff />;
  if (!(await can('stock.manage'))) return <AccessDenied area="lab" />;
  return <StockClient initial={await listStockItemsAction(true)} />;
}
