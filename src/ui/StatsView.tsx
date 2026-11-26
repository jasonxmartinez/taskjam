import { formatHMS, localDate } from "../model/db";
import { INBOX_ID } from "../model/types";
import type { Settings } from "../settings";
import { computeStats } from "../stats/stats";
import { useStore } from "../store";
import { Dot, ViewTitle } from "./common";
import { longDate } from "./format";

function Card({ label, children, foot }: { label: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-line bg-surface-raised p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="tj-stat mt-1">{children}</div>
      <div className="mt-3">{foot}</div>
    </div>
  );
}

function GoalCard({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <Card
      label={label}
      foot={
        <div className="h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={goal} aria-label={`${label}: ${value} of ${goal}`}>
          <div className={`h-full rounded-full ${value >= goal ? "bg-done" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      }
    >
      {value} <span className="text-lg text-ink-muted">of {goal}</span>
    </Card>
  );
}

export function StatsView({ settings }: { settings: Settings }) {
  const { state } = useStore();
  const today = localDate(new Date());
  const st = computeStats(state, today);
  const max = Math.max(settings.dailyGoal, ...st.days.map((d) => d.completed), 1);
  const W = 28 * 24;
  const H = 110;
  const barH = (n: number) => (n / max) * (H - 4);
  const goalY = H - barH(settings.dailyGoal);
  const colorOf = (projectId: string) => (projectId === INBOX_ID ? "var(--line-strong)" : (state.projects.find((p) => p.id === projectId)?.color ?? "var(--line-strong)"));

  return (
    <>
      <ViewTitle title="Stats" subtitle={longDate(today)} />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GoalCard label="Today" value={st.today} goal={settings.dailyGoal} />
        <GoalCard label="This week" value={st.week} goal={settings.weeklyGoal} />
        <Card label="This month" foot={<span className="text-xs text-ink-muted">tasks completed</span>}>
          {st.month}
        </Card>
        <Card label="Streak" foot={<span className="text-xs text-ink-muted">in a row</span>}>
          {st.streak} <span className="text-lg text-ink-muted">{st.streak === 1 ? "day" : "days"}</span>
        </Card>
      </div>

      <h2 className="tj-label mb-2 mt-8">Last 28 days</h2>
      <div className="rounded-[16px] border border-line bg-surface-raised p-4">
        <svg viewBox={`0 0 ${W} ${H + 16}`} className="block w-full" role="img" aria-label={`Tasks completed per day over the last 28 days, ${st.days.reduce((n, d) => n + d.completed, 0)} in total. Daily goal ${settings.dailyGoal}.`}>
          {st.days.map((d, i) => (
            <rect key={d.date} x={i * 24 + 5} y={H - barH(d.completed)} width="14" height={barH(d.completed)} rx="2" fill={d.date === today ? "var(--accent)" : "var(--bar)"}>
              <title>{`${d.date}: ${d.completed} completed${d.timeSec ? `, ${formatHMS(d.timeSec)} tracked` : ""}`}</title>
            </rect>
          ))}
          <line x1="0" x2={W} y1={goalY} y2={goalY} stroke="var(--ink-muted)" strokeDasharray="4 4" strokeWidth="1" />
          <text x="5" y={H + 14} fontSize="10" fill="var(--ink-muted)">
            {new Date(st.days[0].date + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
          </text>
          <text x={W - 5} y={H + 14} fontSize="10" fill="var(--ink-muted)" textAnchor="end">
            Today
          </text>
        </svg>
        <div className="mt-2 text-xs text-ink-muted">Dashed line is your daily goal of {settings.dailyGoal}.</div>
      </div>

      <h2 className="tj-label mb-1 mt-8">By project, last 28 days</h2>
      {st.projects.length === 0 ? (
        <div className="py-2 text-sm text-ink-muted">Complete a task and it shows up here.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="py-2 font-normal">Project</th>
              <th className="py-2 text-right font-normal">Completed</th>
              <th className="py-2 text-right font-normal">Time tracked</th>
            </tr>
          </thead>
          <tbody>
            {st.projects.map((p) => (
              <tr key={p.projectId} className="border-b border-line">
                <td className="py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <Dot color={colorOf(p.projectId)} />
                    {p.name}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{p.completed}</td>
                <td className="py-2.5 text-right tabular-nums">{p.timeSec ? formatHMS(p.timeSec) : "–"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2.5 font-medium">Total time tracked</td>
              <td />
              <td className="py-2.5 text-right font-medium tabular-nums">{st.totalTimeSec ? formatHMS(st.totalTimeSec) : "–"}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="mt-3 text-xs text-ink-muted">Timer time counts on the day you complete the task.</p>
    </>
  );
}
