import { Router, type IRouter } from "express";
import { db, sessionsTable, tasksTable, projectsTable } from "@workspace/db";
import { CreateSessionBody, DeleteSessionParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sessions", async (_req, res) => {
  const sessions = await db
    .select({
      id: sessionsTable.id,
      type: sessionsTable.type,
      durationSeconds: sessionsTable.durationSeconds,
      notes: sessionsTable.notes,
      taskId: sessionsTable.taskId,
      taskName: tasksTable.name,
      projectId: tasksTable.projectId,
      projectName: projectsTable.name,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .leftJoin(tasksTable, eq(sessionsTable.taskId, tasksTable.id))
    .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
    .orderBy(desc(sessionsTable.createdAt));
  res.json(sessions);
});

router.post("/sessions", async (req, res) => {
  const body = CreateSessionBody.parse(req.body);
  const [session] = await db
    .insert(sessionsTable)
    .values({
      type: body.type,
      durationSeconds: body.durationSeconds,
      notes: body.notes,
      taskId: body.taskId ?? null,
    })
    .returning();

  let taskName: string | null = null;
  let projectId: number | null = null;
  let projectName: string | null = null;

  if (session.taskId) {
    const [taskRow] = await db
      .select({
        name: tasksTable.name,
        projectId: tasksTable.projectId,
        projectName: projectsTable.name,
      })
      .from(tasksTable)
      .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(eq(tasksTable.id, session.taskId));

    taskName = taskRow?.name ?? null;
    projectId = taskRow?.projectId ?? null;
    projectName = taskRow?.projectName ?? null;
  }

  res.status(201).json({ ...session, taskName, projectId, projectName });
});

router.delete("/sessions/:id", async (req, res) => {
  const { id } = DeleteSessionParams.parse({ id: req.params.id });
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  res.status(204).send();
});

export default router;
