import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import Sequelize from "sequelize";
import config from "../config/environment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: false, // 恢复：禁用SQL日志
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  }
);

console.log("=== Sequelize配置 ===");
console.log("Host:", config.database.host);
console.log("Port:", config.database.port);
console.log("Database:", config.database.name);
console.log("User:", config.database.user);

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
