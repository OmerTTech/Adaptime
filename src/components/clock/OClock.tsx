import { useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { formatTime, formatDuration } from "@/utils";

const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 195;
const ARC_R = 165;
const INNER_R = 130;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  const s = polar(cx, cy, r, a2);
  const e = polar(cx, cy, r, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

function timeToAngle(ts: number) {
  const d = new Date(ts);
  const h = d.getHours() % 12;
  const m = d.getMinutes();
  return (h + m / 60) * 30;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function OClock() {
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const [, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const now = new Date();
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const sec = now.getSeconds();

  const hourDeg = h * 30 + m * 0.5;
  const minDeg = m * 6 + sec * 0.1;
  const secDeg = sec * 6;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative select-none">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle
            cx={CX}
            cy={CY}
            r={OUTER_R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />

          {HOURS.map((num, i) => {
            const pos = polar(CX, CY, 120, i * 30);
            return (
              <text
                key={num}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text)"
                fontSize="17"
                fontWeight="700"
                style={{ pointerEvents: "none" }}
              >
                {num}
              </text>
            );
          })}

          {Array.from({ length: 60 }).map((_, i) => {
            const isHour = i % 5 === 0;
            const r1 = isHour ? OUTER_R - 8 : OUTER_R - 4;
            const r2 = OUTER_R - (isHour ? 18 : 10);
            const a = i * 6;
            const p1 = polar(CX, CY, r1, a);
            const p2 = polar(CX, CY, r2, a);
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="var(--text-muted)"
                strokeWidth={isHour ? 2.5 : 1}
                opacity={isHour ? 0.9 : 0.4}
                strokeLinecap="round"
              />
            );
          })}

          {tasks.map((task) => {
            let a1 = timeToAngle(task.startTime);
            let a2 = timeToAngle(task.endTime);
            if (a2 <= a1) a2 += 360;
            const sweep = a2 - a1;
            if (sweep <= 0) return null;

            const isActive = task.status === "active";
            const isPaused = task.status === "paused";
            const isSkipped = task.status === "skipped";
            const sw = isActive ? 40 : isPaused ? 32 : 30;
            const op = isActive ? 1 : isPaused ? 0.5 : 0.6;
            const mid = polar(CX, CY, ARC_R + 14, a1 + sweep / 2);

            return (
              <g key={task.id}>
                <path
                  d={arcPath(CX, CY, ARC_R, a1, a2)}
                  fill="none"
                  stroke={task.color}
                  strokeWidth={sw}
                  strokeLinecap="butt"
                  opacity={op}
                  style={
                    isActive
                      ? { filter: `drop-shadow(0 0 10px ${task.color}80)` }
                      : undefined
                  }
                />
                {!isSkipped && (
                  <text
                    x={mid.x}
                    y={mid.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--text)"
                    fontSize="11"
                    fontWeight="600"
                    style={{
                      pointerEvents: "none",
                      textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                    }}
                  >
                    {task.title.length > 6
                      ? task.title.slice(0, 6) + "…"
                      : task.title}
                  </text>
                )}
              </g>
            );
          })}

          <circle cx={CX} cy={CY} r={INNER_R} fill="var(--background)" />

          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 68, hourDeg).x}
            y2={polar(CX, CY, 68, hourDeg).y}
            stroke="var(--text)"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }}
          />
          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 100, minDeg).x}
            y2={polar(CX, CY, 100, minDeg).y}
            stroke="var(--text)"
            strokeWidth="3"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }}
          />
          <line
            x1={polar(CX, CY, -18, secDeg).x}
            y1={polar(CX, CY, -18, secDeg).y}
            x2={polar(CX, CY, 110, secDeg).x}
            y2={polar(CX, CY, 110, secDeg).y}
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={0.8}
          />

          <circle cx={CX} cy={CY} r={7} fill="#6366f1" />
          <circle cx={CX} cy={CY} r={3} fill="var(--background)" />
        </svg>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ marginTop: -4 }}
        >
          <span
            className="text-3xl font-bold tabular-nums"
            style={{
              color: "var(--text)",
              textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            {formatTime(now.getTime())}
          </span>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-[420px]">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
              style={{
                backgroundColor: task.color + "15",
                borderColor: task.color + "30",
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: task.color }}
              />
              <span style={{ color: "var(--text)" }}>{task.title}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {formatDuration(task.endTime - task.startTime)}
              </span>
              {task.status === "completed" && (
                <span className="text-xs ml-1" style={{ color: task.color }}>
                  ✓
                </span>
              )}
              {task.status === "skipped" && (
                <span className="text-xs ml-1 text-danger">✕</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Henüz görev eklenmedi. + butonu ile başlayın.
        </p>
      )}
    </div>
  );
}
