import raw from "./raw.json";
import lib from "./lib";
import path from "node:path";
import fs from "node:fs/promises";

(async () => {
  for (let i = 0; i < raw.length; i++) {
    const input = Buffer.from(
      raw[i].replace("data:image/png;base64,", ""),
      "base64"
    );
    const output = await lib(input);
    const outputPath = path.join(__dirname, `./img/img-${i}`);
    fs.writeFile(`${outputPath}-out.png`, output);
    fs.writeFile(`${outputPath}-in.png`, input);
  }
})();
