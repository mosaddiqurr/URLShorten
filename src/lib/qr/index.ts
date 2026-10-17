import QRCode from "qrcode";

export const QR_STYLES = ["classic", "rounded", "dots"] as const;
export type QrStyle = (typeof QR_STYLES)[number];

// The existing matrix renderer, with a four-module quiet zone and untouched
// finder, timing and alignment patterns in every style. No logo overlays.
export function renderQrSvg(data: string, style: QrStyle = "classic"): string {
  const qr = QRCode.create(data, { errorCorrectionLevel: "H" });
  const count = qr.modules.size;
  const quiet = 4;
  const size = 1024;
  const unit = Math.floor(size / (count + quiet * 2));
  const padding = Math.floor((size - count * unit) / 2);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#102749">`,
  ];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const index = row * count + col;
      if (!qr.modules.data[index]) continue;
      const x = padding + col * unit;
      const y = padding + row * unit;
      const structural = qr.modules.reservedBit[index];
      if (style === "dots" && !structural) {
        parts.push(
          `<circle cx="${x + unit / 2}" cy="${y + unit / 2}" r="${unit * 0.48}"/>`,
        );
      } else {
        const radius = style === "rounded" && !structural ? unit * 0.22 : 0;
        parts.push(
          `<rect x="${x}" y="${y}" width="${unit}" height="${unit}" rx="${radius}"/>`,
        );
      }
    }
  }
  return parts.join("") + "</g></svg>";
}

export const svgDataUrl = (svg: string): string =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

export async function qrPngBlob(svg: string): Promise<Blob> {
  const picture = new Image();
  picture.src = svgDataUrl(svg);
  await picture.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR download is unavailable in this browser.");
  context.drawImage(picture, 0, 0, 1024, 1024);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("QR download is unavailable. Please try again.")),
      "image/png",
    ),
  );
}
