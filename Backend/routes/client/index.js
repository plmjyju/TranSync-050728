import express from "express";

const router = express.Router();

// Placeholder for client routes
router.get("/", (req, res) => {
  res.json({ message: "Client routes - coming soon" });
});

export default router;
