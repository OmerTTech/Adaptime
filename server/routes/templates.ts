import { Router } from "express";
import mongoose from "mongoose";
import { Template, type ITemplateTask } from "../models/Template.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();

const MAX_TASKS = 40;
const MAX_TEMPLATES = 50;

const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const CATEGORIES = ["work", "study", "personal", "health", "other"] as const;

type Priority = (typeof PRIORITIES)[number];
type Category = (typeof CATEGORIES)[number];

interface TemplateLike {
  _id: unknown;
  name: string;
  description?: string;
  tasks?: ITemplateTask[];
}

function serialize(template: TemplateLike) {
  return {
    id: String(template._id),
    name: template.name,
    description: template.description ?? "",
    tasks: (template.tasks ?? []).map((task) => ({
      title: task.title,
      estimatedMinutes: task.estimatedMinutes ?? 30,
      priority: task.priority ?? "medium",
      category: task.category ?? "work",
      firstAction: task.firstAction,
    })),
  };
}

/** İstemciden gelen görev listesini doğrular ve güvenli hale getirir. */
function parseTasks(value: unknown): ITemplateTask[] {
  if (!Array.isArray(value)) return [];

  const tasks: ITemplateTask[] = [];
  for (const raw of value.slice(0, MAX_TASKS)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const title = String(item.title ?? "").trim().slice(0, 160);
    if (!title) continue;

    const minutes = Number(item.estimatedMinutes);
    const priority = String(item.priority ?? "");
    const category = String(item.category ?? "");
    const firstAction = String(item.firstAction ?? "").trim().slice(0, 160);

    tasks.push({
      title,
      estimatedMinutes: Number.isFinite(minutes)
        ? Math.min(600, Math.max(1, Math.round(minutes)))
        : 30,
      priority: (PRIORITIES as readonly string[]).includes(priority)
        ? (priority as Priority)
        : "medium",
      category: (CATEGORIES as readonly string[]).includes(category)
        ? (category as Category)
        : "work",
      firstAction: firstAction || undefined,
    });
  }
  return tasks;
}

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const templates = await Template.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(MAX_TEMPLATES);
    res.json({ templates: templates.map(serialize) });
  } catch (error) {
    console.error("Template list error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Şablon adı gerekli" });

    const tasks = parseTasks(req.body?.tasks);
    if (tasks.length === 0) {
      return res.status(400).json({ error: "En az bir görev ekle" });
    }

    const count = await Template.countDocuments({ userId: req.userId });
    if (count >= MAX_TEMPLATES) {
      return res
        .status(400)
        .json({ error: `En fazla ${MAX_TEMPLATES} şablon saklanabilir` });
    }

    const description = String(req.body?.description ?? "")
      .trim()
      .slice(0, 200);

    const template = await Template.create({
      userId: req.userId,
      name,
      description,
      tasks,
    });

    res.status(201).json({ template: serialize(template) });
  } catch (error) {
    console.error("Template create error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "Şablon bulunamadı" });
    }
    const result = await Template.deleteOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Şablon bulunamadı" });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Template delete error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
