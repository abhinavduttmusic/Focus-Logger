import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/projects", async (_req, res) => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.createdAt));
  res.json(projects);
});

router.post("/projects", async (req, res) => {
  const body = CreateProjectBody.parse(req.body);
  const [project] = await db
    .insert(projectsTable)
    .values({ name: body.name })
    .returning();
  res.status(201).json(project);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = UpdateProjectBody.parse(req.body);
  const [updated] = await db
    .update(projectsTable)
    .set({ name: body.name })
    .where(eq(projectsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(updated);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.status(204).send();
});

export default router;
