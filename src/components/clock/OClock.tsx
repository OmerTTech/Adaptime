import { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { removeTask } from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { formatTime, formatDuration } from "@/utils";
import { Pencil, Trash2 } from "lucide-react";

const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 185;
const INNER_R = 120;
const TEXT_R = OUTER_R + 24;
const TEXT_SPREAD = 35;

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

function isInRange(a: number, start: number, end: number) {
  a = ((a % 360) + 360) % 360;
  const s = ((start % 360) + 360) % 360;
  const e = ((end % 360) + 360) % 360;
  if (s <= e) return a >= s && a <= e;
  return a >= s || a <= e;
}

function getTextArc(midAngle: number, spread: number) {
  if (midAngle >= 45 && midAngle < 135) {
    return {
      start: midAngle - spread,
      end: midAngle + spread,
      sweep: 1,
      side: "left" as const,
    };
  } else if (midAngle >= 135 && midAngle < 225) {
    return {
      start: midAngle + spread,
      end: midAngle - spread,
      sweep: 0,
      side: "right" as const,
    };
  } else if (midAngle >= 225 && midAngle < 315) {
    return {
      start: midAngle + spread,
      end: midAngle - spread,
      sweep: 0,
      side: "right" as const,
    };
  } else {
    return {
      start: midAngle - spread,
      end: midAngle + spread,
      sweep: 1,
      side: "left" as const,
    };
  }
}

function textArcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
  sweep: number,
) {
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  const diff =
    sweep === 1 ? (end - start + 360) % 360 : (start - end + 360) % 360;
  const large = diff > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
}

function calcFontSize(sweepDeg: number) {
  const minS = 15,
    maxS = 240,
    minF = 9,
    maxF = 18;
  const t = Math.min(Math.max((sweepDeg - minS) / (maxS - minS), 0), 1);
  return Math.round((minF + t * (maxF - minF)) * 10) / 10;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function OClock() {
  const dispatch = useAppDispatch();
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

  const taskRanges = tasks.map((task) => {
    let a1 = timeToAngle(task.startTime);
    let a2 = timeToAngle(task.endTime);
    if (a2 <= a1) a2 += 360;
    const sweep = a2 - a1;
    const midAngle = a1 + sweep / 2;
    const {
      start,
      end,
      sweep: textSweep,
      side,
    } = getTextArc(midAngle, TEXT_SPREAD);
    return {
      ...task,
      a1,
      a2,
      sweep,
      textStart: start,
      textEnd: end,
      textSweep,
      textSide: side,
    };
  });

  const getTaskForAngle = (angle: number) =>
    taskRanges.find((t) => isInRange(angle, t.a1, t.a2));

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative select-none">
        <svg width={560} height={560} viewBox="-70 -70 560 560">
          <defs>
            {taskRanges.map((task) => {
              if (task.status === "skipped") return null;
              const pathD = textArcPath(
                CX,
                CY,
                TEXT_R,
                task.textStart,
                task.textEnd,
                task.textSweep,
              );
              return <path key={task.id} id={`tp-${task.id}`} d={pathD} />;
            })}
          </defs>

          <circle
            cx={CX}
            cy={CY}
            r={OUTER_R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />

          {taskRanges.map((task) => (
            <path
              key={`ol-${task.id}`}
              d={arcPath(CX, CY, OUTER_R, task.a1, task.a2)}
              fill="none"
              stroke={task.color}
              strokeWidth="2.5"
              opacity={
                task.status === "active"
                  ? 1
                  : task.status === "paused"
                    ? 0.6
                    : 0.7
              }
            />
          ))}

          {taskRanges.map((task) => (
            <circle
              key={`dot-${task.id}`}
              cx={polar(CX, CY, OUTER_R, task.a1).x}
              cy={polar(CX, CY, OUTER_R, task.a1).y}
              r={4}
              fill={task.color}
              stroke="var(--background)"
              strokeWidth="1.5"
            />
          ))}

          {Array.from({ length: 60 }).map((_, i) => {
            const angle = i * 6;
            const task = getTaskForAngle(angle);
            const isHour = i % 5 === 0;
            const r1 = isHour ? OUTER_R - 7 : OUTER_R - 3;
            const r2 = OUTER_R - (isHour ? 16 : 9);
            const p1 = polar(CX, CY, r1, angle);
            const p2 = polar(CX, CY, r2, angle);
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={task ? task.color : "var(--text-muted)"}
                strokeWidth={isHour ? 2.5 : 1}
                opacity={task ? 1 : isHour ? 0.9 : 0.4}
                strokeLinecap="round"
              />
            );
          })}

          {HOURS.map((num, i) => {
            const pos = polar(CX, CY, 108, i * 30);
            return (
              <text
                key={num}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text)"
                fontSize="16"
                fontWeight="700"
                style={{ pointerEvents: "none" }}
              >
                {num}
              </text>
            );
          })}

          <circle cx={CX} cy={CY} r={INNER_R} fill="var(--background)" />

          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 80, hourDeg).x}
            y2={polar(CX, CY, 80, hourDeg).y}
            stroke="var(--text)"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }}
          />
          <line
            x1={CX}
            y1={CY}
            x2={polar(CX, CY, 105, minDeg).x}
            y2={polar(CX, CY, 105, minDeg).y}
            stroke="var(--text)"
            strokeWidth="3"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }}
          />
          <line
            x1={polar(CX, CY, -15, secDeg).x}
            y1={polar(CX, CY, -15, secDeg).y}
            x2={polar(CX, CY, 105, secDeg).x}
            y2={polar(CX, CY, 105, secDeg).y}
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={0.8}
          />

          <circle cx={CX} cy={CY} r={7} fill="#6366f1" />
          <circle cx={CX} cy={CY} r={3} fill="var(--background)" />

          {taskRanges.map((task) => {
            if (task.status === "skipped") return null;
            const fontSize = calcFontSize(task.sweep);
            return (
              <g key={`txt-${task.id}`}>
                <text
                  fontSize={fontSize}
                  fontWeight="600"
                  fill="var(--text)"
                  style={{
                    pointerEvents: "none",
                    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                  }}
                >
                  <textPath
                    href={`#tp-${task.id}`}
                    startOffset="50%"
                    textAnchor="middle"
                    {...({ side: task.textSide } as any)}
                  >
                    {task.title}
                  </textPath>
                </text>
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-3xl font-extrabold tabular-nums px-3 py-1 rounded-lg"
            style={{
              color: "var(--text)",
              backgroundColor:
                "color-mix(in srgb, var(--background) 85%, transparent)",
              backdropFilter: "blur(4px)",
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            {formatTime(now.getTime())}
          </span>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-[440px]">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs"
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
                <span className="text-xs ml-0.5" style={{ color: task.color }}>
                  ✓
                </span>
              )}
              {task.status === "skipped" && (
                <span className="text-xs ml-0.5 text-danger">✕</span>
              )}
              {(task.status === "pending" || task.status === "skipped") && (
                <>
                  <button
                    onClick={() => dispatch(openEditModal(task.id))}
                    className="ml-1 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    title="Düzenle"
                  >
                    <Pencil size={12} style={{ color: "var(--text-muted)" }} />
                  </button>
                  <button
                    onClick={() => dispatch(removeTask(task.id))}
                    className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    title="Sil"
                  >
                    <Trash2 size={12} style={{ color: "#ef4444" }} />
                  </button>
                </>
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
