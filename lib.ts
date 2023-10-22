import Sharp, { type Sharp as Image } from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

Sharp.concurrency(parseInt(process.env.SHARP_CONCURRENCY || "1"));

const colorCache = new Map<string, [number, number, number]>();

function getColorValues(colorHex: string): [number, number, number] {
  let color = colorCache.get(colorHex);
  if (!color) {
    color = [
      parseInt(colorHex.slice(1, 3), 16),
      parseInt(colorHex.slice(3, 5), 16),
      parseInt(colorHex.slice(5, 7), 16),
    ];
    colorCache.set(colorHex, color);
  }
  return color;
}

async function detectBackgroundColor(
  image: Image,
  metadata: Sharp.Metadata
): Promise<string | null> {
  const { width, height } = metadata;

  if (!width || !height) return null;

  const positions = [
    // 'Square' positions
    [0, 0], // top left
    [width - 1, 0], // top right
    [0, height - 1], // bottom left
    [width - 1, height - 1], // bottom right

    // 'Circle' positions adjusted inward by one pixel
    [width >> 1, 0], // top middle
    [width >> 1, height - 1], // bottom middle
    [0, height >> 1], // left middle
    [width - 1, height >> 1], // right middle
  ];

  const crops = await Promise.all(
    positions.map(([x, y]) =>
      image
        .clone()
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer()
    )
  );

  const areEqual = (a: Buffer, b: Buffer) =>
    a[3] !== 0 && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

  if (
    areEqual(crops[0], crops[1]) &&
    areEqual(crops[0], crops[2]) &&
    areEqual(crops[0], crops[3])
  ) {
    // Square detected
    return `#${crops[0].slice(0, 3).toString("hex")}`;
  } else if (
    areEqual(crops[4], crops[5]) &&
    areEqual(crops[4], crops[6]) &&
    areEqual(crops[4], crops[7])
  ) {
    // Circle detected
    return `#${crops[4].slice(0, 3).toString("hex")}`;
  }

  return null;
}

async function removeSolidBackground(
  image: Image,
  colorHex: string | null
): Promise<Image> {
  if (!colorHex) return image;

  const [red, green, blue] = getColorValues(colorHex);
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    if (
      Math.abs(data[i] - red) <= 50 &&
      Math.abs(data[i + 1] - green) <= 50 &&
      Math.abs(data[i + 2] - blue) <= 50
    ) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    }
  }

  return Sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

async function squareTrim(image: Image): Promise<Image> {
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;

  let left = width,
    top = info.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] !== 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  const smallest = Math.min(
    left,
    top,
    width - right - 1,
    info.height - bottom - 1
  );

  const extractWidth = Math.max(1, width - 2 * smallest);
  const extractHeight = Math.max(1, info.height - 2 * smallest);

  return image.extract({
    left: smallest,
    top: smallest,
    width: extractWidth,
    height: extractHeight,
  });
}

export default async function main(input: Buffer, filename: string) {
  const image = Sharp(input);
  const metadata = await image.metadata();

  const backgroundColorHex = await detectBackgroundColor(image, metadata);
  const transparentImage = await removeSolidBackground(
    image,
    backgroundColorHex
  );
  const croppedImage = await squareTrim(transparentImage);

  const outputPath = path.join(__dirname, `./img/${filename}`);
  const output = await croppedImage
    .resize({
      width: 32,
      height: 32,
      fit: "contain",
      background: backgroundColorHex || { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .flatten(backgroundColorHex ? { background: backgroundColorHex } : false)
    .png({ compressionLevel: 9, colors: 12 })
    .toBuffer();

  await Promise.all([
    fs.writeFile(`${outputPath}-out.png`, output),
    fs.writeFile(`${outputPath}-in.png`, input),
  ]);
}
