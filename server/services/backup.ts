import { Routine } from "../models/Routine.js";
import { RoutineBackup, type IBackupRoutine } from "../models/RoutineBackup.js";

function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export interface BackupResult {
  dateKey: string;
  users: number;
  routines: number;
}

/**
 * Son `days` günün planlarını kullanıcı başına tek JSON snapshot olarak saklar.
 * Günde bir kez çalıştırılır (cron); aynı gün ikinci kez çağrılırsa üzerine yazar.
 */
export async function createDailyBackups(days = 7): Promise<BackupResult> {
  const dateKey = dateKeyDaysAgo(0);
  const since = dateKeyDaysAgo(days - 1);

  const routines = await Routine.find({ date: { $gte: since } })
    .select("userId date tasks dayEndTime streak revision")
    .lean();

  const grouped = new Map<string, IBackupRoutine[]>();
  for (const routine of routines) {
    const userId = String(routine.userId);
    const list = grouped.get(userId) ?? [];
    list.push({
      date: routine.date,
      tasks: routine.tasks ?? [],
      dayEndTime: routine.dayEndTime ?? 0,
      streak: routine.streak ?? 0,
      revision: routine.revision,
    });
    grouped.set(userId, list);
  }

  for (const [userId, list] of grouped) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    await RoutineBackup.findOneAndUpdate(
      { userId, dateKey },
      { $set: { routines: list } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  return { dateKey, users: grouped.size, routines: routines.length };
}
