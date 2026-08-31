import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
} from "../controllers/authController.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from "../utils/validation.js";

const router = Router();

// Rate-limit all auth endpoints against brute force.
router.use(authRateLimiter);

router.post("/register", validateBody(registerSchema), register);
router.post("/login", validateBody(loginSchema), login);
router.post("/logout", logout);
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  forgotPassword
);
router.get("/me", requireAuth, me);

export default router;
