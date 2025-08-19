import db from "../models/index.js";

// 重算 Forecast 打板/包裹进度
export async function recalcForecastPalletProgress(
  forecastId,
  { transaction } = {}
) {
  const pallets = await db.Pallet.findAll({
    where: { forecast_id: forecastId },
    attributes: ["id", "box_count", "status"],
    transaction,
  });
  const totalPallets = pallets.length;
  const palletizedPackages = pallets.reduce(
    (sum, p) => sum + (p.box_count || 0),
    0
  );
  const allSealedOrStored = pallets.every((p) =>
    ["stored", "waiting_clear", "delivered", "dispatched"].includes(p.status)
  );
  await db.Forecast.update(
    {
      total_pallets: totalPallets,
      palletized_packages: palletizedPackages,
      palletization_completed: allSealedOrStored,
    },
    { where: { id: forecastId }, transaction }
  );
  return {
    total_pallets: totalPallets,
    palletized_packages: palletizedPackages,
    palletization_completed: allSealedOrStored,
  };
}
