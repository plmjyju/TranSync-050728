// utils/generateForecastCode.js
import dayjs from "dayjs";

const charset = "ABCDEFGHJKMNPQRSTUVWXYZ"; // 去掉了易混淆字符

export default function generateForecastCode() {
  const datePart = dayjs().format("YYMMDD"); // 日期：250725
  const randomNumber = Math.floor(100 + Math.random() * 900); // 三位随机数字 100-999
  const randomChar = charset[Math.floor(Math.random() * charset.length)];

  return `FC${datePart}${randomNumber}${randomChar}`; // FC250725169M
}
