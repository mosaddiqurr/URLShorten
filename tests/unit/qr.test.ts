import { describe, expect, it } from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
import { QR_STYLES, renderQrSvg } from "../../src/lib/qr";

describe("QR decode verification", () => {
  for (const style of QR_STYLES) {
    for (const size of [220, 512, 1024]) {
      it(`${style} decodes at ${size}px`, async () => {
        const url = "https://urlshorten.netlify.app/research-2026";
        const image = await sharp(Buffer.from(renderQrSvg(url, style)))
          .resize(size, size)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const decoded = jsQR(
          new Uint8ClampedArray(image.data),
          image.info.width,
          image.info.height,
        );
        expect(decoded?.data).toBe(url);
      });
    }
    it(`${style} decodes a long custom domain and 48-character alias`, async () => {
      const url =
        "https://a-long-but-valid-domain.example.com/" +
        "research-2026-".repeat(3) +
        "portfolio";
      const image = await sharp(Buffer.from(renderQrSvg(url, style)))
        .resize(1024)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(
        jsQR(
          new Uint8ClampedArray(image.data),
          image.info.width,
          image.info.height,
        )?.data,
      ).toBe(url);
    });
  }
});
