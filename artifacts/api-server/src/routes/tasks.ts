import { Router, type IRouter } from "express";
import { db, tasksTable, projectsTable } from "@workspace/db";
import { CreateTaskBody } from "@workspace/api-zod";
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
