import { Router } from "express";
import { requireAuth } from "../../../middleware/auth";
import { getDemoPreview } from "../../../../services/demo/demo-preview.service";
import { ok } from "../../../../utils/http-response";

export const demoPreviewRouter = Router();

demoPreviewRouter.get("/api/v1/demo/preview", requireAuth, async (req, res) => {
  const preview = getDemoPreview();
  return ok(req, res, preview);
});
