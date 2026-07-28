import { useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { formatTime, formatDuration } from "@/utils";

const SIZE = 400;
const CENTER = SIZE / 2;
const RADIUS = 170;
const INNER_RADIUS = 90;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function OClock() {
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const totalSpan =
    tasks.length > 0
      ? {
          start: Math.min(...tasks.map((t) => t.startTime)),
          end: Math.max(...tasks.map((t) => t.endTime)),
        }
      : { start: Date.now(), end: Date.now() + 3600000 };

  const totalDuration = totalSpan.end - totalSpan.start || 1;

  const currentAngle =
    tasks.length > 0 ? ((now - totalSpan.start) / totalDuration) * 360 : 0;

  const clampedAngle = Math.max(0, Math.min(360, currentAngle));

  const activeTask = tasks.find((t) => t.status === "active");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth="2"
          />

          {tasks.map((task) => {
            const startOffset =
              ((task.startTime - totalSpan.start) / totalDuration) * 360;
            const endOffset =
              ((task.endTime - totalSpan.start) / totalDuration) * 360;
            const sweepAngle = endOffset - startOffset;

            if (sweepAngle <= 0) return null;

            const startAngle = startOffset;
            const endAngle = Math.min(startOffset + sweepAngle, 360);

            const midAngle = startAngle + sweepAngle / 2;
            const labelPos = polarToCartesian(
              CENTER,
              CENTER,
              RADIUS - 30,
              midAngle,
            );

            const isActive = task.status === "active";
            const isPaused = task.status === "paused";

            return (
              <g key={task.id}>
                {Array.from({ length: Math.ceil(sweepAngle / 1) }).map(
                  (_, i) => {
                    const arcStart = startAngle + i;
                    const arcEnd = Math.min(startAngle + i + 1, endAngle);
                    if (arcEnd <= arcStart) return null;
                    return (
                      <path
                        key={`${task.id}-arc-${i}`}
                        d={describeArc(
                          CENTER,
                          CENTER,
                          RADIUS,
                          arcStart,
                          arcEnd,
                        )}
                        fill="none"
                        stroke={task.color}
                        strokeWidth={isActive ? 38 : isPaused ? 30 : 32}
                        strokeLinecap="round"
                        opacity={isPaused ? 0.5 : isActive ? 1 : 0.8}
                        style={{
                          filter: isActive
                            ? `drop-shadow(0 0 8px ${task.color})`
                            : "none",
                        }}
                      />
                    );
                  },
                )}
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="11"
                  fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {task.title.length > 8
                    ? task.title.slice(0, 8) + "…"
                    : task.title}
                </text>
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="#0a0a0f" />

          {tasks.length > 0 && (
            <line
              x1={CENTER}
              y1={CENTER}
              x2={
                CENTER +
                (INNER_RADIUS - 10) *
                  Math.cos(((clampedAngle - 90) * Math.PI) / 180)
              }
              y2={
                CENTER +
                (INNER_RADIUS - 10) *
                  Math.sin(((clampedAngle - 90) * Math.PI) / 180)
              }
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}

          <circle cx={CENTER} cy={CENTER} r={4} fill="#6366f1" />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-white tabular-nums">
            {formatTime(now)}
          </span>
          {activeTask && (
            <span className="text-xs text-text-muted mt-1">
              {activeTask.title}
            </span>
          )}
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-[400px]">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-xs"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: task.color }}
              />
              <span className="text-text">{task.title}</span>
              <span className="text-text-muted">
                {formatDuration(task.endTime - task.startTime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <p className="text-text-muted text-sm">
          Henüz görev eklenmedi. + butonu ile başlayın.
        </p>
      )}
    </div>
  );
}
