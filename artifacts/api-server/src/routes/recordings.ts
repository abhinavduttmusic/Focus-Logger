import { Router, type IRouter } from "express";
import { db, recordingsTable } from "@workspace/db";
import { CreateRecordingBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/recordings", async (req, res) => {
  const body = CreateRecordingBody.parse(req.body);
  const [recording] = await db
    .insert(recordingsTable)
    .values({
      sessionId: body.sessionId,
      objectPath: body.objectPath,
      label: body.label ?? null,
      durationSeconds: body.durationSeconds,
      offsetSeconds: body.offsetSeconds,
    })
    .returning();

  res.status(201).json(recording);
});

export default router;
