import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import tasksRouter from "./tasks";
import projectsRouter from "./projects";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(tasksRouter);
router.use(projectsRouter);

export default router;
