import express from "express";
import { authenticate } from "./middlewares/authenticate.js";

import db from "./models/index.js";
import { createClientAppRouter } from "./utils/createClientAppRouter.js";
await db.sequelize.sync({ alter: true });
const app = express();
app.use(express.json());

// 加载各端模块
await createClientAppRouter(app, "omp");
await createClientAppRouter(app, "wms");
await createClientAppRouter(app, "agent");
await createClientAppRouter(app, "client");

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
