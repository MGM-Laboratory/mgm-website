import { tearDownPreviewEnvironment } from "./railway-api.mjs";

const token = process.env.RAILWAY_TOKEN;
const prNumber = process.env.PR_NUMBER;

const result = await tearDownPreviewEnvironment(token, prNumber);
console.log(result.note);
