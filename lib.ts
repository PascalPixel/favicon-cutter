import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

async function detectBackgroundColor(
  imageBuffer: Buffer
): Promise<string | null> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Image has no width or height");
  }

  const positions = [
    { left: 0, top: 0 },
    { left: metadata.width - 1, top: 0 },
    { left: 0, top: metadata.height - 1 },
    { left: metadata.width - 1, top: metadata.height - 1 },
    { left: Math.floor(metadata.width / 2), top: 0 },
    { left: Math.floor(metadata.width / 2), top: metadata.height - 1 },
    { left: 0, top: Math.floor(metadata.height / 2) },
    { left: metadata.width - 1, top: Math.floor(metadata.height / 2) },
  ];

  const buffers = await Promise.all(
    positions.map((pos) =>
      image
        .clone()
        .extract({ left: pos.left, top: pos.top, width: 1, height: 1 })
        .raw()
        .toBuffer()
        .catch(() => null)
    )
  );

  if (buffers.includes(null)) {
    console.error("Couldn't get all positions");
    return null;
  }

  const areEqual = (a: Buffer, b: Buffer) =>
    a[3] !== 0 && a.slice(0, 3).every((val, i) => val === b[i]);

  const [
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    middleTop,
    middleBottom,
    middleLeft,
    middleRight,
  ] = buffers;

  if (
    !topLeft ||
    !topRight ||
    !bottomLeft ||
    !bottomRight ||
    !middleTop ||
    !middleBottom ||
    !middleLeft ||
    !middleRight
  ) {
    console.error("Couldn't get all positions");
    return null;
  }

  if (
    areEqual(topLeft, topRight) &&
    areEqual(topLeft, bottomRight) &&
    areEqual(topLeft, bottomLeft)
  ) {
    return `#${topLeft.slice(0, 3).toString("hex")}`;
  } else if (
    areEqual(middleTop, middleBottom) &&
    areEqual(middleTop, middleLeft) &&
    areEqual(middleTop, middleRight)
  ) {
    return `#${middleTop.slice(0, 3).toString("hex")}`;
  }

  return null;
}

async function removeSolidBackground(
  imageBuffer: Buffer,
  colorHex: string
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Image has no width or height");
  }

  const [red, green, blue] = [1, 3, 5].map((start) =>
    parseInt(colorHex.slice(start, start + 2), 16)
  );

  const { data } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (
      Math.abs(r - red) <= 10 &&
      Math.abs(g - green) <= 10 &&
      Math.abs(b - blue) <= 10
    ) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: metadata.width, height: metadata.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

export default async function main(images: string[]) {
  await Promise.all(
    images.map(async (data, i) => {
      try {
        const filename = "img-" + i;
        const imageBuffer = Buffer.from(
          data.replace("data:image/png;base64,", ""),
          "base64"
        );

        await fs.writeFile(
          path.join(__dirname, `./img/${filename}-in.png`),
          imageBuffer
        );

        const backgroundColorHex = await detectBackgroundColor(imageBuffer);
        const outputBuffer = backgroundColorHex
          ? await removeSolidBackground(imageBuffer, backgroundColorHex)
          : imageBuffer;

        await fs.writeFile(
          path.join(__dirname, `./img/${filename}-out.png`),
          await sharp(outputBuffer)
            .resize(32, 32)
            .png({ compressionLevel: 9, colors: 64 })
            .toBuffer()
        );
      } catch (e) {
        console.error(e);
      }
    })
  );
}
