import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import tasksRouter from "./tasks";
import projectsRouter from "./projects";
import storageRouter from "./storage";
import recordingsRouter from "./recordings";
import aiRouter from "./ai";
import debriefsRouter from "./debriefs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(tasksRouter);
router.use(projectsRouter);
router.use(storageRouter);
router.use(recordingsRouter);
router.use(aiRouter);
router.use(debriefsRouter);

export default router;
