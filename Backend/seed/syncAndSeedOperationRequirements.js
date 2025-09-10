import db from "../models/index.js";
import requirements from "./operation-requirements.js";
import { pathToFileURL } from "url";

async function syncAndSeed() {
  try {
    console.log("== Sync (alter) models ==");
    await db.sequelize.sync({ alter: true });
    console.log("== Upsert simplified OperationRequirements ==");

    const { OperationRequirement } = db;

    let created = 0;
    let updated = 0;

    for (const r of requirements) {
      const existing = await OperationRequirement.findOne({
        where: { requirement_code: r.requirement_code },
      });
      if (!existing) {
        await OperationRequirement.create(r);
        created += 1;
        console.log(`+ created: ${r.requirement_code}`);
      } else {
        await existing.update({
          requirement_name: r.requirement_name,
          requirement_name_en: r.requirement_name_en,
          description: r.description,
          handling_mode: r.handling_mode,
          carrier: r.carrier,
          label_abbr: r.label_abbr,
          sort_order: r.sort_order ?? existing.sort_order ?? 0,
          is_active: true,
        });
        updated += 1;
        console.log(`~ updated: ${r.requirement_code}`);
      }
    }

    console.log(`Done. created=${created}, updated=${updated}`);
  } catch (e) {
    console.error("syncAndSeed failed:", e);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

// 兼容 Windows 路径的 ESM 主模块检测
const isMain = (() => {
  try {
    return (
      process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  syncAndSeed().then(() => process.exit(0));
}

export default syncAndSeed;
