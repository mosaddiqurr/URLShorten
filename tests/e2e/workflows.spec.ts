import { test, expect } from "@playwright/test";
import sharp from "sharp";
import jsQR from "jsqr";

const destination =
  "https://example.com/?project=research-2026&source=portfolio#overview";

test("create a custom link, copy it, decode every downloaded style and preview it", async ({
  page,
  context,
  request,
}, testInfo) => {
  const alias =
    testInfo.project.name === "desktop" ? "research-2026" : "mobile-project";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(3);
  await expect(
    page.getByRole("img", { name: "URLShorten", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("img", { name: "URLShorten", exact: true })
    .evaluate((image: HTMLImageElement) => image.decode());
  await page.getByLabel("Paste a long URL").fill(destination);
  await expect(
    page.getByRole("button", { name: "Random alias", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Custom alias", exact: true }).click();
  await page.getByLabel("Custom alias").fill(alias);
  await expect(page.locator(".preview-url")).toContainText("/" + alias);
  if (testInfo.project.name === "desktop")
    await page.screenshot({
      path: "docs/screenshots/home.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(
    page.getByRole("heading", { name: "Your link is ready." }),
  ).toBeVisible();
  const shortUrl = await page.getByLabel("Your short URL").inputValue();
  expect(shortUrl).toBe("http://127.0.0.1:5190/" + alias);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    shortUrl,
  );
  if (testInfo.project.name === "desktop")
    await page.screenshot({
      path: "docs/screenshots/result.png",
      fullPage: true,
    });
  for (const style of ["Classic", "Rounded", "Dots"]) {
    await page.getByRole("button", { name: style, exact: true }).click();
    await expect(
      page.getByRole("button", { name: style, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG" }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(
      `urlshorten-${alias}-${style.toLowerCase()}.png`,
    );
    const image = await sharp((await download.path())!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(1024);
    expect(
      jsQR(
        new Uint8ClampedArray(image.data),
        image.info.width,
        image.info.height,
      )?.data,
    ).toBe(shortUrl);
  }
  const redirect = await request.get(shortUrl, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe(destination);
  await page.getByRole("link", { name: "Preview this link" }).click();
  await expect(page.getByLabel("Paste a shortened URL")).toHaveValue(shortUrl);
  await page.getByRole("button", { name: "Preview destination" }).click();
  await expect(
    page.getByRole("heading", { name: "Destination revealed" }),
  ).toBeVisible();
  await expect(page.locator(".final-destination")).toContainText(destination);
  await expect(page.locator(".facts")).toContainText("example.com");
  await expect(
    page.getByRole("link", { name: "Open destination" }),
  ).toHaveAttribute("href", destination);
  expect(page.url()).toContain("/preview");
  await page.getByText("View redirect chain").click();
  await expect(page.locator(".redirect-chain li")).toHaveCount(2);
  if (testInfo.project.name === "desktop")
    await page.screenshot({
      path: "docs/screenshots/preview.png",
      fullPage: true,
    });
  else
    await page.screenshot({
      path: testInfo.outputPath("preview-mobile.png"),
      fullPage: true,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("generate an alias and resolve it from a different browser context after the creator closes", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Random alias", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Custom alias")).toHaveCount(0);
  await page
    .getByLabel("Paste a long URL")
    .fill("https://example.com/share#section");
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(page.getByLabel("Your short URL")).toBeVisible();
  const shortUrl = await page.getByLabel("Your short URL").inputValue();
  expect(new URL(shortUrl).pathname).toMatch(/^\/[a-z0-9]{7}$/);
  await page.close();
  const visitor = await browser.newContext();
  const visit = await visitor.newPage();
  await visit.goto(shortUrl);
  await expect(visit).toHaveURL("https://example.com/share#section");
  expect(new URL(visit.url()).hostname).toBe("example.com");
  await visitor.close();
});

test("duplicate aliases, reserved names and invalid URLs show useful errors", async ({
  page,
  request,
}, testInfo) => {
  const alias = `taken-${testInfo.project.name}`;
  const response = await request.post("/api/links", {
    data: { url: "https://example.com/", alias },
  });
  expect(response.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Custom alias", exact: true }).click();
  await page.getByLabel("Paste a long URL").fill("https://example.org/");
  await page.getByLabel("Custom alias").fill(alias.toUpperCase());
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This custom link is already taken.",
  );
  await page.getByLabel("Custom alias").fill("preview");
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "That alias is reserved. Choose another name.",
  );
  await page.getByLabel("Custom alias").fill("");
  await page.getByLabel("Paste a long URL").fill("not a URL");
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter a valid HTTP or HTTPS URL.",
  );
});

test("switching back to random ignores a custom name and create another resets to random", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Custom alias", exact: true }).click();
  await page.getByLabel("Custom alias").fill("preview");
  await page.getByRole("button", { name: "Random alias", exact: true }).click();
  await expect(page.getByLabel("Custom alias")).toHaveCount(0);
  await page.getByLabel("Paste a long URL").fill("https://example.com/random");
  await page.getByRole("button", { name: "Create short link" }).click();
  await expect(page.getByLabel("Your short URL")).toBeVisible();
  const shortUrl = await page.getByLabel("Your short URL").inputValue();
  expect(new URL(shortUrl).pathname).toMatch(/^\/[a-z0-9]{7}$/);
  await page.getByRole("button", { name: "Create another link" }).click();
  await expect(
    page.getByRole("button", { name: "Random alias", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Paste a long URL")).toHaveValue("");
  await expect(page.getByLabel("Custom alias")).toHaveCount(0);
});

test("preview blocks internal addresses and never automatically opens a destination", async ({
  page,
  request,
}) => {
  await page.goto("/preview");
  await page
    .getByLabel("Paste a shortened URL")
    .fill("http://169.254.169.254/latest/meta-data/");
  await page.getByRole("button", { name: "Preview destination" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The destination could not be resolved safely.",
  );
  await expect(page).toHaveURL(/\/preview$/);
  expect(
    (
      await request.post("/api/preview", { data: { url: "http://127.0.0.1/" } })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/links", { data: { url: "http://localhost/" } })
    ).status(),
  ).toBe(422);
});

test("direct page refresh, author link and mobile layout work", async ({
  page,
}) => {
  for (const path of ["/", "/preview", "/preview/", "/about", "/about/"]) {
    await page.goto(path);
    await page.reload();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator(".author a")).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/mosaddiqur/",
  );
  await expect(
    page.getByRole("link", { name: /Dashboard|Analytics|Login|Sign in/ }),
  ).toHaveCount(0);
});
