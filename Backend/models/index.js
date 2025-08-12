import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import Sequelize from "sequelize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: console.log, // 启用详细日志
  }
);

console.log("=== Sequelize配置 ===");
console.log("Host:", process.env.DB_HOST);
console.log("Port:", process.env.DB_PORT);
console.log("Database:", process.env.DB_NAME);
console.log("User:", process.env.DB_USER);

const db = { sequelize, Sequelize };

const files = await fs.readdir(__dirname);
for (const file of files) {
  if (file !== "index.js" && file.endsWith(".js")) {
    const fullPath = path.resolve(__dirname, file);
    const modelModule = await import(pathToFileURL(fullPath).href);
    const modelDef = modelModule.default;
    const model = modelDef(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  }
}

Object.values(db).forEach((model) => {
  if (model.associate) model.associate(db);
});

export default db;
