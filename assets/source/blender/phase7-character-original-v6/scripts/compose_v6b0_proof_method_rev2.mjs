import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const evidence = path.join(base, "evidence", "v6b0-proof-method-rev2");
const renders = path.join(evidence, "renders");
const concept = path.join(base, "concept", "kyx-vanguard-v6c-production-target-v1.png");
const bg = { r: 3, g: 7, b: 12, alpha: 1 };

function labelSvg(width, title, subtitle = "") {
  const safeTitle = title.replaceAll("&", "&amp;");
  const safeSubtitle = subtitle.replaceAll("&", "&amp;");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80">
      <rect width="100%" height="80" fill="#05090f"/>
      <rect x="0" y="0" width="8" height="80" fill="#26b9e8"/>
      <text x="30" y="34" fill="#eef7fb" font-family="Segoe UI, Arial" font-size="26" font-weight="700">${safeTitle}</text>
      <text x="30" y="61" fill="#84a3b5" font-family="Segoe UI, Arial" font-size="17">${safeSubtitle}</text>
    </svg>
  `);
}

function rejectionSvg(width, y, message) {
  const safe = message.replaceAll("&", "&amp;");
  return {
    input: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44">
        <rect width="100%" height="44" fill="#68171e" fill-opacity="0.94"/>
        <text x="${width / 2}" y="29" text-anchor="middle" fill="#fff4f4" font-family="Segoe UI, Arial" font-size="20" font-weight="700">${safe}</text>
      </svg>
    `),
    left: 0,
    top: y,
  };
}

async function fitted(input, width, height) {
  return sharp(input)
    .resize({ width, height, fit: "contain", background: bg })
    .png()
    .toBuffer();
}

async function threeViewBoard() {
  const panelWidth = 1120;
  const imageHeight = 1120;
  const panels = [
    {
      file: "kyx-v6b0-proof-method-rev2-front.png",
      title: "FRONT METHOD READ",
      subtitle: "garment tension / assembly silhouette",
    },
    {
      file: "kyx-v6b0-proof-method-rev2-armor-close.png",
      title: "ARMOR + STOCK TERMINATION",
      subtitle: "thickness / rails / clearance audit",
    },
    {
      file: "kyx-v6b0-proof-method-rev2-contact-close.png",
      title: "FIVE-DIGIT CONTACT AUDIT",
      subtitle: "palm / grip / trigger / guard evidence",
    },
  ];
  const composites = [];
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    composites.push({
      input: await fitted(path.join(renders, panel.file), panelWidth, imageHeight),
      left: index * panelWidth,
      top: 80,
    });
    composites.push({ input: labelSvg(panelWidth, panel.title, panel.subtitle), left: index * panelWidth, top: 0 });
  }
  composites.push(rejectionSvg(panelWidth * panels.length, 1156, "SELF-REJECTED METHOD CHECKPOINT — CONTACT AND CONTINUOUS ARMOR PERIMETERS NOT PROVEN"));
  await sharp({
    create: { width: panelWidth * panels.length, height: 1200, channels: 4, background: bg },
  })
    .composite(composites)
    .png()
    .toFile(path.join(renders, "kyx-v6b0-proof-method-rev2-three-view-board.png"));
}

async function conceptBoard() {
  const columnWidth = 1200;
  const upperHeight = 760;
  const lowerHeight = 360;

  const targetUpper = await sharp(concept)
    .extract({ left: 0, top: 0, width: 420, height: 760 })
    .resize({ width: columnWidth, height: upperHeight, fit: "contain", background: bg })
    .png()
    .toBuffer();
  const targetRifle = await sharp(concept)
    .extract({ left: 180, top: 735, width: 1180, height: 289 })
    .resize({ width: columnWidth, height: lowerHeight, fit: "contain", background: bg })
    .png()
    .toBuffer();
  const methodArmor = await fitted(
    path.join(renders, "kyx-v6b0-proof-method-rev2-armor-close.png"),
    columnWidth,
    upperHeight,
  );
  const methodContact = await fitted(
    path.join(renders, "kyx-v6b0-proof-method-rev2-contact-close.png"),
    columnWidth,
    lowerHeight,
  );

  await sharp({ create: { width: 2400, height: 1200, channels: 4, background: bg } })
    .composite([
      { input: labelSvg(columnWidth, "PINNED CONCEPT TARGET", "comparable upper-body + rifle construction crop"), left: 0, top: 0 },
      { input: labelSvg(columnWidth, "V6-B0 REV2 DIRECT RENDER", "bounded proof-of-method; no acceptance claim"), left: columnWidth, top: 0 },
      { input: targetUpper, left: 0, top: 80 },
      { input: targetRifle, left: 0, top: 840 },
      { input: methodArmor, left: columnWidth, top: 80 },
      { input: methodContact, left: columnWidth, top: 840 },
      rejectionSvg(2400, 1156, "SELF-REJECTED — CONCEPT DENSITY, CONTINUOUS ARMOR, AND LITERAL WEAPON CONTACT ARE NOT MATCHED"),
    ])
    .png()
    .toFile(path.join(renders, "kyx-v6b0-proof-method-rev2-concept-comparison-board.png"));
}

await threeViewBoard();
await conceptBoard();
console.log("V6B0_REV2_BOARDS=2");
