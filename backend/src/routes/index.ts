import { Router } from "express";
import { cognitoAuth } from "../middleware/cognitoAuth";
import * as c from "../controllers/apiController";

const router = Router();

router.get("/health", c.health);

router.use(cognitoAuth);

router.get("/tasks", c.listTasks);
router.post("/tasks", c.createTask);
router.get("/tasks/:id/upload-url", c.presignUpload);
router.get("/tasks/:id/comments", c.listComments);
router.post("/tasks/:id/comments", c.createComment);
router.post("/tasks/:id/images", c.appendTaskImage);
router.get("/tasks/:id", c.getTask);
router.put("/tasks/:id", c.updateTask);
router.delete("/tasks/:id", c.deleteTask);

router.get("/projects", c.listProjects);
router.post("/projects", c.createProject);

export default router;
