import raw from "./raw.json";
import lib from "./lib";

for (let i = 0; i < raw.length; i++) {
  const filename = "img-" + i;
  const image = Buffer.from(
    raw[i].replace("data:image/png;base64,", ""),
    "base64"
  );
  lib(image, filename);
}
