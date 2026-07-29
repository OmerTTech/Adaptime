export type TaskStatus =
  "pending" | "active" | "paused" | "completed" | "skipped";

export type ViewMode = "oclock" | "timeline";

export type PauseMode = "shift" | "cut" | "balance";

export type FlowMode = "shift" | "eatNext";

export type EarlyFinishMode = "extendBreak" | "pullForward";

export interface TaskBlock {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  originalDuration: number;
  color: string;
  status: TaskStatus;
  startedAt?: number;
  pausedAt?: number;
  pausedDuration: number;
  flowExtensions: number;
}

export interface DayRoutine {
  id: string;
  date: string;
  tasks: TaskBlock[];
  dayEndTime: number;
  streak: number;
}

export interface PauseImpact {
  mode: PauseMode;
  newDayEndTime: number;
  affectedTasks: { id: string; newStart: number; newEnd: number }[];
  description: string;
}

export interface FlowImpact {
  mode: FlowMode;
  extraMinutes: number;
  newDayEndTime: number;
  affectedTasks: { id: string; newStart: number; newEnd: number }[];
  description: string;
}

export interface EarlyFinishImpact {
  mode: EarlyFinishMode;
  savedMinutes: number;
  newDayEndTime: number;
  description: string;
}

export interface PreviewState {
  originalTasks: TaskBlock[];
  modifiedTasks: TaskBlock[];
  newDayEndTime: number;
  description: string;
  source: "pause" | "flow" | "earlyFinish";
}
