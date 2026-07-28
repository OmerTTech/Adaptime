import { useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { formatTime, formatDuration } from "@/utils";

const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 185;
const INNER_R = 140;
const ARC_R = (OUTER_R + INNER_R) / 2;

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

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const dayMs = dayEnd.getTime() - dayStart.getTime();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative select-none">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Outer ring */}
          <circle
            cx={CX}
            cy={CY}
            r={OUTER_R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />

          {/* Hour numbers */}
          {HOURS.map((num, i) => {
            const pos = polar(CX, CY, 122, i * 30);
            return (
              <text
                key={num}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text)"
                fontSize="16"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {num}
              </text>
            );
          })}

          {/* Tick marks */}
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
                strokeWidth={isHour ? 2 : 1}
                opacity={isHour ? 0.8 : 0.4}
              />
            );
          })}

          {/* Task arcs on ring between outer and inner */}
          {tasks.map((task) => {
            const ts = task.startTime - dayStart.getTime();
            const te = task.endTime - dayStart.getTime();
            const a1 = (ts / dayMs) * 360;
            const a2 = (te / dayMs) * 360;
            const sweep = a2 - a1;
            if (sweep <= 0) return null;

            const isActive = task.status === "active";
            const isPaused = task.status === "paused";
            const sw = isActive ? 38 : isPaused ? 30 : 32;
            const op = isActive ? 1 : isPaused ? 0.5 : 0.7;
            const labelPos = polar(CX, CY, ARC_R, a1 + sweep / 2);

            return (
              <g key={task.id}>
                <path
                  d={arcPath(CX, CY, ARC_R, a1, a2)}
                  fill="none"
                  stroke={task.color}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  opacity={op}
                  style={
                    isActive
                      ? { filter: `drop-shadow(0 0 8px ${task.color}60)` }
                      : undefined
                  }
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text)"
                  fontSize="11"
                  fontWeight="600"
                  style={{
                    pointerEvents: "none",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}
                >
                  {task.title.length > 7
                    ? task.title.slice(0, 7) + "…"
                    : task.title}
                </text>
              </g>
            );
          })}

          {/* Hour hand */}
          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 70, hourDeg).x}
            y2={polar(CX, CY, 70, hourDeg).y}
            stroke="var(--text)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Minute hand */}
          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 100, minDeg).x}
            y2={polar(CX, CY, 100, minDeg).y}
            stroke="var(--text)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Second hand */}
          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 110, secDeg).x}
            y2={polar(CX, CY, 110, secDeg).y}
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Center dot */}
          <circle cx={CX} cy={CY} r={6} fill="#6366f1" />
          <circle cx={CX} cy={CY} r={3} fill="var(--background)" />
        </svg>

        {/* Center time display */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ marginTop: -4 }}
        >
          <span
            className="text-xl font-bold tabular-nums"
            style={{ color: "var(--text)" }}
          >
            {formatTime(now.getTime())}
          </span>
          {tasks.find(
            (t) => t.status === "active" || t.status === "paused",
          ) && (
            <span
              className="text-[10px"
              style={{ color: "var(--text-muted)", marginTop: 2 }}
            >
              {
                tasks.find(
                  (t) => t.status === "active" || t.status === "paused",
                )?.title
              }
            </span>
          )}
        </div>
      </div>

      {/* Task chips */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-[400px]">
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
