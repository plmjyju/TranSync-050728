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
  if (file === "index.js" || !file.endsWith(".js")) continue;
  const fullPath = path.resolve(__dirname, file);
  try {
    const modelModule = await import(pathToFileURL(fullPath).href);
    const modelDef = modelModule?.default;
    if (typeof modelDef === "function") {
      const model = modelDef(sequelize, Sequelize.DataTypes);
      if (!model?.name) {
        console.warn(`⚠️ 模型未返回有效实例: ${file}`);
        continue;
      }
      db[model.name] = model;
    } else {
      console.warn(`⚠️ 跳过模型（未导出函数 default）：${file}`);
    }
  } catch (err) {
    console.error(`❌ 加载模型失败: ${file} ->`, err.message);
  }
}

Object.values(db).forEach((model) => {
  if (model && typeof model.associate === "function") {
    try {
      model.associate(db);
    } catch (err) {
      console.error(`❌ 关联模型失败: ${model.name}`, err.message);
    }
  }
});

export default db;
