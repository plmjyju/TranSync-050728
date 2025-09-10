import { Sequelize } from "sequelize";
import { Umzug, SequelizeStorage } from "umzug";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import db from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sequelize = db.sequelize;
  const qi = sequelize.getQueryInterface();
  const globDef = ["../migrations/*.js", { cwd: __dirname }];

  const umzug = new Umzug({
    migrations: {
      glob: globDef,
      resolve: ({ name, path: p }) => {
        return {
          name,
          up: async () => {
            const mod = await import(pathToFileURL(p).href);
            if (typeof mod.up === "function") {
              return mod.up({
                context: qi,
                Sequelize: db.Sequelize,
                sequelize,
              });
            }
          },
          down: async () => {
            const mod = await import(pathToFileURL(p).href);
            if (typeof mod.down === "function") {
              return mod.down({
                context: qi,
                Sequelize: db.Sequelize,
                sequelize,
              });
            }
          },
        };
      },
    },
    context: qi,
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });

  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "list") {
    const executed = await umzug.executed();
    const pending = await umzug.pending();
    console.log(
      "Executed:",
      executed.map((m) => m.name)
    );
    console.log(
      "Pending:",
      pending.map((m) => m.name)
    );
    return;
  }

  if (cmd === "up-one" && arg) {
    console.log("Running single migration:", arg);
    await umzug.up({ migrations: [arg] });
    console.log("Done");
    return;
  }

  if (cmd === "redo" && arg) {
    const all = [...(await umzug.executed()), ...(await umzug.pending())];
    const target = all
      .map((m) => m.name)
      .find((n) => n === arg || n.includes(arg));
    if (!target) {
      console.error("Migration not found:", arg);
      process.exit(1);
    }
    const executed = await umzug.executed();
    const isExecuted = executed.map((m) => m.name).includes(target);
    if (isExecuted) {
      console.log("Down migration:", target);
      await umzug.down({ migrations: [target] });
    }
    console.log("Up migration:", target);
    await umzug.up({ migrations: [target] });
    console.log("Redo done:", target);
    return;
  }

  const pending = await umzug.pending();
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  console.log(
    "Pending migrations:",
    pending.map((m) => m.name)
  );
  await umzug.up();
  console.log("Migrations executed successfully.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
