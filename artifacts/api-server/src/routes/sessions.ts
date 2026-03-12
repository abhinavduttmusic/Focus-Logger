import { Router, type IRouter } from "express";
import { db, sessionsTable, tasksTable, projectsTable, recordingsTable } from "@workspace/db";
import { CreateSessionBody, DeleteSessionParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sessions", async (_req, res) => {
  const rows = await db
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
      recordingId: recordingsTable.id,
      recordingObjectPath: recordingsTable.objectPath,
      recordingDurationSeconds: recordingsTable.durationSeconds,
      recordingOffsetSeconds: recordingsTable.offsetSeconds,
      recordingCreatedAt: recordingsTable.createdAt,
    })
    .from(sessionsTable)
    .leftJoin(tasksTable, eq(sessionsTable.taskId, tasksTable.id))
    .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
    .leftJoin(recordingsTable, eq(sessionsTable.id, recordingsTable.sessionId))
    .orderBy(desc(sessionsTable.createdAt));

  const sessionMap = new Map<number, any>();
  for (const row of rows) {
    if (!sessionMap.has(row.id)) {
      sessionMap.set(row.id, {
        id: row.id,
        type: row.type,
        durationSeconds: row.durationSeconds,
        notes: row.notes,
        taskId: row.taskId,
        taskName: row.taskName,
        projectId: row.projectId,
        projectName: row.projectName,
        createdAt: row.createdAt,
        recordings: [],
      });
    }
    if (row.recordingId != null) {
      sessionMap.get(row.id)!.recordings.push({
        id: row.recordingId,
        sessionId: row.id,
        objectPath: row.recordingObjectPath,
        durationSeconds: row.recordingDurationSeconds,
        offsetSeconds: row.recordingOffsetSeconds,
        createdAt: row.recordingCreatedAt,
      });
    }
  }

  res.json(Array.from(sessionMap.values()));
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

  res.status(201).json({ ...session, taskName, projectId, projectName, recordings: [] });
});

router.delete("/sessions/:id", async (req, res) => {
  const { id } = DeleteSessionParams.parse({ id: req.params.id });
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  res.status(204).send();
});

export default router;
