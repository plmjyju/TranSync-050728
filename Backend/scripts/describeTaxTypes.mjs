import db from "../models/index.js";

(async () => {
  try {
    console.log("Checking tax_types table structure...");
    const [results] = await db.sequelize.query("DESCRIBE tax_types");
    console.log("Table structure:", results);

    console.log("\nChecking current tax_types data...");
    const taxTypes = await db.sequelize.query("SELECT * FROM tax_types", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log("Tax types found:", taxTypes);

    await db.sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    await db.sequelize.close();
    process.exit(1);
  }
})();
