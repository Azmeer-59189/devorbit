'use client';
import {useId, type CSSProperties, type ReactNode} from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {dashboardActivity} from '@/lib/dashboard-activity';
import {displayDate} from '@/lib/dates';
import {useChartAnimation} from '@/lib/motion';
import {statusName} from '@/lib/live-types';
import {taskStatuses} from '@/lib/task-list';

export type Trend = ReturnType<typeof dashboardActivity>['trend'];

const chartStyle: CSSProperties = {fontSize: 12, color: 'var(--muted)'};
const axis = {axisLine: false, tickLine: false, tick: {fontSize: 12, fill: 'var(--text)'}};
const crosshair = {stroke: 'var(--primary)', strokeWidth: 1};

type TooltipEntry = {name?: unknown; value?: unknown; color?: string; payload?: {fill?: string}};

/** One tooltip for every chart: a heading, then a swatch, name and value per series. */
function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label ? <strong>{label}</strong> : null}
      {payload.map(item => (
        <span key={String(item.name)}>
          <i style={{background: item.payload?.fill || item.color}} />
          {String(item.name)}
          <b>{String(item.value)}</b>
        </span>
      ))}
    </div>
  );
}

const monthLabel = (date: string, month: 'short' | 'long', year?: 'numeric') =>
  new Intl.DateTimeFormat('en', {month, year, timeZone: 'UTC'}).format(new Date(date + 'T12:00:00Z'));

/** Bucket name on the axis. */
export const trendTick = (date: string, unit: Trend['unit'], today: string) =>
  unit === 'month' ? monthLabel(date, 'short') : displayDate(date, today);

/** Bucket name in the tooltip and data table, where there is room to be exact. */
export const trendLabel = (date: string, unit: Trend['unit'], today: string) =>
  unit === 'month'
    ? monthLabel(date, 'long', 'numeric')
    : `${unit === 'week' ? 'Week of ' : ''}${displayDate(date, today)}`;

/** Selected period over the same-length period before it; both share one axis. */
export function TrendChart({trend, today}: {trend: Trend; today: string}) {
  const animation = useChartAnimation();
  const id = useId();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart
        data={trend.points}
        accessibilityLayer
        style={chartStyle}
        margin={{top: 12, right: 12, left: -20, bottom: 0}}
      >
        <defs>
          <linearGradient id={`${id}current`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id={`${id}previous`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-previous)" stopOpacity={0.38} />
            <stop offset="100%" stopColor="var(--chart-previous)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          {...axis}
          dataKey="date"
          tickFormatter={date => trendTick(date, trend.unit, today)}
          tickMargin={12}
          minTickGap={28}
        />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          cursor={crosshair}
          itemSorter={item => (item.dataKey === 'count' ? 0 : 1)}
          content={({active, label, payload}) => (
            <ChartTooltip
              active={active}
              // Recharts renders this with no label until the chart is hovered.
              label={label ? trendLabel(String(label), trend.unit, today) : undefined}
              payload={payload as readonly TooltipEntry[]}
            />
          )}
        />
        {/* Monotone curves stay smooth without dipping below zero or overshooting a peak. */}
        <Area
          type="monotone"
          dataKey="previous"
          name="Previous period"
          stroke="var(--chart-previous)"
          strokeWidth={2}
          fill={`url(#${id}previous)`}
          dot={trend.points.length === 1}
          activeDot={{r: 4, stroke: 'var(--surface)', strokeWidth: 2}}
          {...animation}
        />
        <Area
          type="monotone"
          dataKey="count"
          name="Selected period"
          stroke="var(--primary)"
          strokeWidth={2}
          fill={`url(#${id}current)`}
          dot={trend.points.length === 1}
          activeDot={{r: 5, stroke: 'var(--surface)', strokeWidth: 2}}
          {...animation}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Tile-sized trend with no axes; the tile's number and the full chart carry the values. */
export function Sparkline({points}: {points: Trend['points']}) {
  const animation = useChartAnimation();
  const id = useId();
  return (
    <div className="tile-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height={32}>
        <AreaChart data={points} margin={{top: 3, right: 1, left: 1, bottom: 1}}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-completed)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-completed)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-completed)"
            strokeWidth={2}
            fill={`url(#${id})`}
            {...animation}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One whole split into parts. Each part takes its colour from `data-status`; zero parts draw nothing. */
export function SegmentBar({parts}: {parts: {status: string; value: number}[]}) {
  return (
    <i className="segment-bar" aria-hidden="true">
      {parts
        .filter(part => part.value > 0)
        .map(part => (
          <i key={part.status} data-status={part.status} style={{flexGrow: part.value}} />
        ))}
    </i>
  );
}

/** Share of a total; the fill takes its colour from the tile's `data-status`. */
export function Meter({share}: {share: number}) {
  return (
    <i className="tile-meter" aria-hidden="true">
      <i style={{width: `${Math.min(share, 1) * 100}%`}} />
    </i>
  );
}

export function StatusDonut({
  statuses,
  onStatus,
}: {
  statuses: {progress: string; count: number}[];
  onStatus: (status: string) => void;
}) {
  const animation = useChartAnimation();
  // Fixed workflow order, so a status keeps its place and colour whichever filters are on.
  const rows = taskStatuses.flatMap(status => {
    const count = statuses.find(s => s.progress === status)?.count || 0;
    return count ? [{status, name: statusName(status), count, fill: `var(--chart-${status})`}] : [];
  });
  return (
    <div className="status-donut">
      <div className="status-donut-ring">
        <ResponsiveContainer width="100%" height={148}>
          <PieChart accessibilityLayer style={chartStyle}>
            <Tooltip
              content={({active, payload}) => (
                <ChartTooltip active={active} payload={payload as readonly TooltipEntry[]} />
              )}
            />
            <Pie
              data={rows}
              dataKey="count"
              nameKey="name"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              cornerRadius={4}
              stroke="var(--surface)"
              strokeWidth={2}
              {...animation}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="status-donut-total">
          <strong>{rows.reduce((n, r) => n + r.count, 0).toLocaleString()}</strong>
          <span>tasks</span>
        </div>
      </div>
      <ul className="status-legend">
        {rows.map(row => (
          <li key={row.status}>
            <button
              data-status={row.status}
              onClick={() => onStatus(row.status)}
              aria-label={`${row.name} tasks: ${row.count}. View them`}
            >
              <i />
              <span>{row.name}</span>
              <strong>{row.count.toLocaleString()}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rounded columns, one per person; the axis shows first names and the tooltip the full name. */
export function WorkloadChart({rows}: {rows: {name: string; count: number}[]}) {
  const animation = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height={264}>
      <BarChart data={rows} accessibilityLayer style={chartStyle} margin={{top: 22, right: 4, left: 4, bottom: 0}}>
        <XAxis
          {...axis}
          dataKey="name"
          tickFormatter={name => String(name).split(' ')[0]}
          tickMargin={10}
          minTickGap={6}
        />
        <YAxis hide allowDecimals={false} domain={[0, 'dataMax']} />
        <Tooltip
          cursor={{fill: 'var(--primary)', fillOpacity: 0.07}}
          content={({active, label, payload}) => (
            <ChartTooltip active={active} label={label} payload={payload as readonly TooltipEntry[]} />
          )}
        />
        <Bar
          dataKey="count"
          name="Open tasks"
          fill="var(--primary)"
          maxBarSize={24}
          radius={[6, 6, 0, 0]}
          label={{position: 'top', fill: 'var(--text)', fontSize: 12, fontWeight: 600}}
          {...animation}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeoTrendChart({points}: {points: {measured_at: string; value: number}[]}) {
  const animation = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={points}
        accessibilityLayer
        style={chartStyle}
        margin={{top: 12, right: 12, left: -20, bottom: 0}}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis {...axis} dataKey="measured_at" tickMargin={12} minTickGap={28} />
        <YAxis {...axis} domain={[0, 100]} />
        <Tooltip
          cursor={crosshair}
          content={({active, label, payload}) => (
            <ChartTooltip active={active} label={label} payload={payload as readonly TooltipEntry[]} />
          )}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="SEO score (0–100)"
          stroke="var(--chart-completed)"
          strokeWidth={2}
          dot={{r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--chart-completed)'}}
          activeDot={{r: 5, stroke: 'var(--surface)', strokeWidth: 2}}
          {...animation}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
