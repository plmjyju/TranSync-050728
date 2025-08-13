import db from "../models/index.js";

(async () => {
  try {
    console.log("Checking tax_types table...");
    const taxTypes = await db.sequelize.query("SELECT * FROM tax_types", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log("Tax types found:", taxTypes);

    if (taxTypes.length === 0) {
      console.log("No tax types found. Creating default tax types...");
      await db.sequelize.query(`
        INSERT INTO tax_types (name, description, rate, created_at, updated_at)
        VALUES 
        ('VAT', 'Value Added Tax', 0.0, NOW(), NOW()),
        ('Customs Duty', 'Import customs duty', 0.0, NOW(), NOW()),
        ('Excise Tax', 'Special excise tax', 0.0, NOW(), NOW())
      `);

      const newTaxTypes = await db.sequelize.query("SELECT * FROM tax_types", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      console.log("Created tax types:", newTaxTypes);
    }

    await db.sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    await db.sequelize.close();
    process.exit(1);
  }
})();
