import Sharp, { type Sharp as Image } from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

Sharp.concurrency(parseInt(process.env.SHARP_CONCURRENCY || "1"));

async function detectBackgroundColor(
  image: Image,
  width: number,
  height: number
): Promise<string | null> {
  const positions = [
    { left: 0, top: 0 },
    { left: width - 1, top: 0 },
    { left: 0, top: width - 1 },
    { left: width - 1, top: height - 1 },
    { left: Math.floor(width / 2), top: 0 },
    { left: Math.floor(width / 2), top: height - 1 },
    { left: 0, top: Math.floor(height / 2) },
    { left: width - 1, top: Math.floor(height / 2) },
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
  colorHex: string | null
): Promise<Image> {
  if (!colorHex) {
    return image;
  }

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
      data[i + 0] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  return Sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

async function squareTrim(image: Image): Promise<Image> {
  const { data, info } = await image.raw().toBuffer({
    resolveWithObject: true,
  });

  let left = info.width;
  let top = info.height;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] !== 0) {
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
    info.width - right,
    info.height - bottom
  );

  return image.extract({
    left: smallest,
    top: smallest,
    width: info.width - smallest * 2,
    height: info.height - smallest * 2,
  });
}

export default async function main(input: Buffer, filename: string) {
  const image = Sharp(input);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Invalid image");
  const backgroundColorHex = await detectBackgroundColor(
    image,
    metadata.width,
    metadata.height
  );
  const transparentImage = await removeSolidBackground(
    image,
    backgroundColorHex
  );
  const croppedImage = await squareTrim(transparentImage);
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
  await fs.writeFile(path.join(__dirname, `./img/${filename}-out.png`), output);
  await fs.writeFile(path.join(__dirname, `./img/${filename}-in.png`), input);
}
