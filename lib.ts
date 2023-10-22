import Sharp, { type Sharp as Image } from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

Sharp.concurrency(parseInt(process.env.SHARP_CONCURRENCY || "1"));

async function detectBackgroundColor(image: Image): Promise<string | null> {
  const positions = [
    { left: 0, top: 0 },
    { left: 31, top: 0 },
    { left: 0, top: 31 },
    { left: 31, top: 31 },
    { left: 16, top: 0 },
    { left: 16, top: 31 },
    { left: 0, top: 16 },
    { left: 31, top: 16 },
  ];

  const crops = await Promise.all(
    positions.map((pos) =>
      image
        .clone()
        .extract({ left: pos.left, top: pos.top, width: 1, height: 1 })
        .raw()
        .toBuffer()
    )
  );

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
  ] = crops;

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
  image: Image,
  colorHex: string
): Promise<Image> {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    parseInt(colorHex.slice(start, start + 2), 16)
  );

  const { data, info } = await image.raw().toBuffer({
    resolveWithObject: true,
  });

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

  return Sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

export default async function main(data: Buffer, filename: string) {
  const image = Sharp(data).resize({
    width: 32,
    height: 32,
    fit: "contain",
    kernel: "nearest",
  });

  await fs.writeFile(path.join(__dirname, `./img/${filename}-in.png`), data);

  const backgroundColorHex = await detectBackgroundColor(image);
  const outputImage = backgroundColorHex
    ? await removeSolidBackground(image, backgroundColorHex)
    : image;

  await fs.writeFile(
    path.join(__dirname, `./img/${filename}-out.png`),
    await outputImage.png({ compressionLevel: 9, colors: 64 }).toBuffer()
  );
}
