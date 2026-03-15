import { Router, type IRouter } from "express";
import { db, tasksTable, projectsTable } from "@workspace/db";
import { CreateTaskBody, UpdateTaskBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/tasks", async (_req, res) => {
  const tasks = await db
    .select({
      id: tasksTable.id,
      name: tasksTable.name,
      projectId: tasksTable.projectId,
      projectName: projectsTable.name,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
    .orderBy(desc(tasksTable.createdAt));
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.parse(req.body);
  const [task] = await db
    .insert(tasksTable)
    .values({
      name: body.name,
      projectId: body.projectId ?? null,
    })
    .returning();

  let projectName: string | null = null;
  if (task.projectId) {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, task.projectId));
    projectName = project?.name ?? null;
  }

  res.status(201).json({ ...task, projectName });
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = UpdateTaskBody.parse(req.body);
  if (body.name === undefined && body.projectId === undefined) {
    res.status(400).json({ error: "At least one field (name, projectId) must be provided" });
    return;
  }
  const updateData: { name?: string; projectId?: number | null } = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.projectId !== undefined) updateData.projectId = body.projectId;
  const [updated] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  let projectName: string | null = null;
  if (updated.projectId) {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, updated.projectId));
    projectName = project?.name ?? null;
  }

  res.json({ ...updated, projectName });
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.status(204).send();
});

export default router;
