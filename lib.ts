import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

async function detectBackgroundColor(imageBuffer: Buffer) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (
    !metadata ||
    typeof metadata.width === "undefined" ||
    typeof metadata.height === "undefined"
  ) {
    throw new Error("Image has no width or height");
  }

  let topLeft: Buffer | null = null;
  let topRight: Buffer | null = null;
  let bottomLeft: Buffer | null = null;
  let bottomRight: Buffer | null = null;
  let middleTop: Buffer | null = null;
  let middleBottom: Buffer | null = null;
  let middleLeft: Buffer | null = null;
  let middleRight: Buffer | null = null;

  try {
    topLeft = await image
      .clone()
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get topLeft");
  }

  try {
    topRight = await image
      .clone()
      .extract({ left: metadata.width - 1, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get topRight");
  }

  try {
    bottomLeft = await image
      .clone()
      .extract({ left: 0, top: metadata.height - 1, width: 1, height: 1 })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get bottomLeft");
  }

  try {
    bottomRight = await image
      .clone()
      .extract({
        left: metadata.width - 1,
        top: metadata.height - 1,
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get bottomRight");
  }

  try {
    middleTop = await image
      .clone()
      .extract({
        left: Math.floor(metadata.width / 2),
        top: 0,
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get middleTop");
  }

  try {
    middleBottom = await image
      .clone()
      .extract({
        left: Math.floor(metadata.width / 2),
        top: metadata.height - 1,
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get middleBottom");
  }

  try {
    middleLeft = await image
      .clone()
      .extract({
        left: 0,
        top: Math.floor(metadata.height / 2),
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get middleLeft");
  }

  try {
    middleRight = await image
      .clone()
      .extract({
        left: metadata.width - 1,
        top: Math.floor(metadata.height / 2),
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
  } catch (err) {
    console.error("Couldn't get middleRight");
  }

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
    console.error("Couldn't get all corners");
    return null;
  }

  // Are the corners the same color?
  let bgColorMaybe: Buffer | null = null;
  if (
    topLeft[3] !== 0 && // ignore transparent pixels
    topLeft[0] === topRight[0] &&
    topLeft[1] === topRight[1] &&
    topLeft[2] === topRight[2] &&
    topLeft[0] === bottomRight[0] &&
    topLeft[1] === bottomRight[1] &&
    topLeft[2] === bottomRight[2] &&
    topLeft[0] === bottomLeft[0] &&
    topLeft[1] === bottomLeft[1] &&
    topLeft[2] === bottomLeft[2]
  ) {
    // the corner edges are all the same, so use that color
    console.log("Using corner color");
    bgColorMaybe = topLeft;
  } else if (
    middleTop[3] !== 0 && // ignore transparent pixels
    middleTop[0] === middleBottom[0] &&
    middleTop[1] === middleBottom[1] &&
    middleTop[2] === middleBottom[2] &&
    middleTop[0] === middleLeft[0] &&
    middleTop[1] === middleLeft[1] &&
    middleTop[2] === middleLeft[2] &&
    middleTop[0] === middleRight[0] &&
    middleTop[1] === middleRight[1] &&
    middleTop[2] === middleRight[2]
  ) {
    // the middle edges are all the same, so use that color
    console.log("Using middle color");
    bgColorMaybe = middleTop;
  }

  if (!bgColorMaybe) {
    // We couldn't find a solid color, so return null
    console.error("Couldn't find a solid color");
    return null;
  }

  // We found a solid color! Convert it to hex
  return `#${Buffer.from(bgColorMaybe).toString("hex")}`;
}

async function removeSolidBackground(
  imageBuffer: Buffer,
  colorHex: string
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  if (
    !metadata ||
    typeof metadata.width === "undefined" ||
    typeof metadata.height === "undefined"
  ) {
    throw new Error("Image has no width or height");
  }
  // find all colorHex pixels and make them transparent
  const { data } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] >= parseInt(colorHex.slice(1, 3), 16) - 10 &&
      data[i] <= parseInt(colorHex.slice(1, 3), 16) + 10 &&
      data[i + 1] >= parseInt(colorHex.slice(3, 5), 16) - 10 &&
      data[i + 1] <= parseInt(colorHex.slice(3, 5), 16) + 10 &&
      data[i + 2] >= parseInt(colorHex.slice(5, 7), 16) - 10 &&
      data[i + 2] <= parseInt(colorHex.slice(5, 7), 16) + 10
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
        await fs.writeFile(
          path.join(__dirname, `./img/${filename}-out.png`),
          await sharp(
            backgroundColorHex
              ? await removeSolidBackground(imageBuffer, backgroundColorHex)
              : imageBuffer
          )
            .resize(32, 32)
            .png({ compressionLevel: 9, colors: 64 })
            .toBuffer()
        );
      } catch (e) {
        console.log(e);
      }
    })
  );
}
