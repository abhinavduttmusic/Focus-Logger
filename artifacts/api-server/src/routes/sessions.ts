import { Router, type IRouter } from "express";
import { db, sessionsTable } from "@workspace/db";
import { CreateSessionBody, DeleteSessionParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sessions", async (_req, res) => {
  const sessions = await db
    .select()
    .from(sessionsTable)
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
    })
    .returning();
  res.status(201).json(session);
});

router.delete("/sessions/:id", async (req, res) => {
  const { id } = DeleteSessionParams.parse({ id: req.params.id });
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  res.status(204).send();
});

export default router;
