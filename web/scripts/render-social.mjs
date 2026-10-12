import fs from "node:fs";
import { chromium } from "playwright";
const executablePath = process.env.OGCLUB_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    "<style>body{margin:0}</style>" +
      fs.readFileSync("design/social-card.svg", "utf8"),
  );
  await page.screenshot({ path: "public/social-card.png" });
} finally {
  await browser.close();
}
