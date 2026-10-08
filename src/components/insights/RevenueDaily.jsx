import React, { useEffect, useMemo, useState } from 'react';
import { fetchAll } from '@/lib/db';
import { Panel } from '@/components/ui';
import LineChart from '@/components/charts/LineChart';
import { revenueDaily, revenueStats } from '@/lib/revenue';
import { currencySymbol } from '@/lib/format';

// Revenue per day over the last 30 days, from the sales table (ops module).
// Shown only when there are sales; a day before the first sale is a gap, a
// quiet day after it is a zero.
const DAYS = 30;

export default function RevenueDaily() {
  const [sales, setSales] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.order('paid_at', { ascending: false }), 'sales')
      .then((rows) => mounted && setSales(Array.isArray(rows) ? rows : []))
      .catch(() => mounted && setSales([]));
    return () => {
      mounted = false;
    };
  }, []);

  const currency = useMemo(() => revenueStats(sales || [], null).currency, [sales]);
  const series = useMemo(() => revenueDaily(sales || [], { days: DAYS, currency }), [sales, currency]);

  if (!sales || sales.length === 0) return null;
  const sym = currencySymbol(currency);
  return (
    <Panel title={`Revenue per day, last ${DAYS} days`}>
      <LineChart
        series={series}
        unit="revenue"
        format={(v) => `${sym}${v.toFixed(2)}`}
        label={`Revenue per day in ${currency.toUpperCase()}, last ${DAYS} days`}
      />
    </Panel>
  );
}
