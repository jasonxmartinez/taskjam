import { localDate, formatHMS } from "../model/db";
import type { Settings } from "../settings";
import { computeStats } from "../stats/stats";
import { useStore } from "../store";

function Goal({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {value}
        <span className="text-base font-normal text-slate-500"> / {goal}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={value} aria-valuemax={goal} aria-label={`${label} goal`}>
        <div className={`h-full ${value >= goal ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Plain({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const hm = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export function StatsView({ settings }: { settings: Settings }) {
  const { state } = useStore();
  const today = localDate(new Date());
  const st = computeStats(state, today);
  const max = Math.max(settings.dailyGoal, ...st.days.map((d) => d.completed), 1);
  const W = 28 * 20;
  const H = 120;
  const barH = (n: number) => (n / max) * (H - 4);

  return (
    <>
      <h1 className="mb-4 px-2 text-2xl font-semibold">Stats</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Goal label="Today" value={st.today} goal={settings.dailyGoal} />
        <Goal label="This week" value={st.week} goal={settings.weeklyGoal} />
        <Plain label="This month" value={String(st.month)} hint="tasks completed" />
        <Plain label="Streak" value={`${st.streak} day${st.streak === 1 ? "" : "s"}`} hint="in a row with a completion" />
      </div>

      <h2 className="mb-2 mt-8 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Last 28 days</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full min-w-[560px]" role="img" aria-label={`Tasks completed per day over the last 28 days. ${st.days.reduce((n, d) => n + d.completed, 0)} in total.`}>
          <line x1="0" x2={W} y1={H - barH(settings.dailyGoal)} y2={H - barH(settings.dailyGoal)} className="stroke-slate-400" strokeDasharray="4 4" />
          {st.days.map((d, i) => (
            <g key={d.date}>
              <rect x={i * 20 + 3} y={H - barH(d.completed)} width="14" height={barH(d.completed)} rx="2" className={d.date === today ? "fill-indigo-600" : "fill-indigo-400"}>
                <title>{`${d.date}: ${d.completed} completed${d.timeSec ? `, ${hm(d.timeSec)}` : ""}`}</title>
              </rect>
              {(i % 7 === 0 || d.date === today) && (
                <text x={i * 20 + 10} y={H + 14} textAnchor="middle" className="fill-slate-500" fontSize="9">
                  {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                </text>
              )}
            </g>
          ))}
        </svg>
        <div className="mt-1 text-xs text-slate-500">Dashed line is your daily goal ({settings.dailyGoal}).</div>
      </div>

      <h2 className="mb-2 mt-8 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By project, last 28 days</h2>
      {st.projects.length === 0 ? (
        <div className="px-2 text-sm text-slate-500">Complete a task and it shows up here.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-2 py-1 font-medium">Project</th>
              <th className="px-2 py-1 text-right font-medium">Completed</th>
              <th className="px-2 py-1 text-right font-medium">Time tracked</th>
            </tr>
          </thead>
          <tbody>
            {st.projects.map((p) => (
              <tr key={p.projectId} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-2 py-1.5">{p.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.completed}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.timeSec ? formatHMS(p.timeSec) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 font-medium dark:border-slate-700">
              <td className="px-2 py-1.5">Total time tracked</td>
              <td />
              <td className="px-2 py-1.5 text-right tabular-nums">{st.totalTimeSec ? formatHMS(st.totalTimeSec) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="mt-3 px-2 text-xs text-slate-500">Timer time counts on the day you complete the task.</p>
    </>
  );
}
