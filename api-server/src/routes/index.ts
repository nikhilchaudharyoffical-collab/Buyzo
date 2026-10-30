import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storeRouter from "./store";
import adminRouter from "./admin";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storeRouter);
router.use(paymentsRouter);
router.use("/admin", adminRouter);

export default router;
