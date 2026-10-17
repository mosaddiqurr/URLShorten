import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import logo from "../../assets/logo-url.png";
import { aliasProblem, normalizeAlias } from "../shared/aliases";
import type { CreatedLink, PreviewResult } from "../shared/types";
import {
  QR_STYLES,
  renderQrSvg,
  svgDataUrl,
  qrPngBlob,
  type QrStyle,
} from "../lib/qr";
import { post } from "./api";
import {
  Arrow,
  Check,
  Copy,
  Download,
  External,
  Eye,
  LinkIcon,
  Shield,
  Spinner,
} from "./icons";

const AUTHOR = "https://www.linkedin.com/in/mosaddiqur/";
function Brand() {
  return (
    <span className="brand">
      <img src={logo} alt="URLShorten" width="132" height="132" />
    </span>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="intro">
      <p className="eyebrow">
        <span />
        {eyebrow}
      </p>
      <h1>{title}</h1>
      <p className="lede">{children}</p>
    </div>
  );
}
function validUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function Home() {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasMode, setAliasMode] = useState<"random" | "custom">("random");
  const [result, setResult] = useState<CreatedLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedAlias = aliasMode === "custom" ? alias : "";
  const normalized = normalizeAlias(selectedAlias);
  const aliasError = selectedAlias.trim() ? aliasProblem(selectedAlias) : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!validUrl(url)) {
      setError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    if (aliasError) {
      setError(aliasError);
      return;
    }
    setBusy(true);
    try {
      setResult(
        await post<CreatedLink>("/api/links", {
          url: url.trim(),
          alias: selectedAlias,
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <Result
        link={result}
        reset={() => {
          setResult(null);
          setUrl("");
          setAlias("");
          setAliasMode("random");
          setError("");
        }}
      />
    );
  return (
    <>
      <Intro eyebrow="SHORTEN & SHARE" title="Your link, only shorter.">
        Shorten links. Customize the alias. Share as QR.
      </Intro>
      <section className="panel create-panel" aria-label="Create a short link">
        <div className="panel-heading">
          <span className="icon-tile">
            <LinkIcon />
          </span>
          <h2>Create a short link</h2>
          <span className="small-label">Simple by design</span>
        </div>
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <div className="field">
            <label htmlFor="long-url">Paste a long URL</label>
            <input
              id="long-url"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/very/long/link"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={2048}
              required
              aria-describedby="url-hint"
            />
            <p className="hint" id="url-hint">
              A complete URL starting with https:// or http://
            </p>
          </div>
          <div className="alias-choice">
            <p className="choice-label">Short link alias</p>
            <div
              className="style-picker alias-picker"
              role="group"
              aria-label="Alias type"
            >
              {(["random", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={aliasMode === mode}
                  onClick={() => {
                    setAliasMode(mode);
                    setError("");
                  }}
                >
                  {mode === "random" ? "Random alias" : "Custom alias"}
                </button>
              ))}
            </div>
            {aliasMode === "random" && (
              <p className="hint">
                We’ll create a random short link for you. No name needed.
              </p>
            )}
          </div>
          {aliasMode === "custom" && (
            <div className="field">
              <label htmlFor="alias">
                Custom alias <span className="optional">optional</span>
              </label>
              <input
                id="alias"
                name="alias"
                placeholder="my-project"
                value={alias}
                onChange={(e) => {
                  setAlias(e.target.value);
                  setError("");
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={48}
                aria-describedby="alias-hint"
                aria-invalid={!!aliasError}
              />
              <p
                id="alias-hint"
                className={aliasError ? "hint hint-error" : "hint"}
              >
                {aliasError ||
                  "3–48 letters, numbers, hyphens or underscores. Aliases use lowercase."}
              </p>
            </div>
          )}
          <div className="alias-preview">
            <LinkIcon size={16} />
            <span className="preview-label">Your link</span>
            <span className="preview-url" dir="ltr">
              {aliasMode === "random" ? (
                "A random short alias will be generated when you create the link."
              ) : (
                <>
                  {window.location.host}/
                  <strong>{normalized || "your-alias"}</strong>
                </>
              )}
            </span>
          </div>
          <ErrorMessage message={error} />
          <button className="button primary full" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Creating your short link…
              </>
            ) : (
              <>
                Create short link
                <Arrow />
              </>
            )}
          </button>
        </form>
      </section>
      <div className="secondary-callout">
        <span className="secondary-icon">
          <Eye size={21} />
        </span>
        <div>
          <p>Know where a short link goes.</p>
          <span>Reveal the destination before you open it.</span>
        </div>
        <a href="/preview" className="text-link">
          Preview a link
          <Arrow size={17} />
        </a>
      </div>
      <p className="quiet-note">
        No account needed. Your links stay available after you close this page.
      </p>
    </>
  );
}

function Result({ link, reset }: { link: CreatedLink; reset: () => void }) {
  const [style, setStyle] = useState<QrStyle>("classic");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const svg = useMemo(
    () => renderQrSvg(link.shortUrl, style),
    [link.shortUrl, style],
  );
  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied(true);
    } catch {
      input.current?.focus();
      input.current?.select();
      setError(
        "Select and copy the short URL above. Clipboard access is unavailable.",
      );
    }
  }
  async function download() {
    setError("");
    setDownloading(true);
    try {
      const objectUrl = URL.createObjectURL(await qrPngBlob(svg));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `urlshorten-${link.alias}-${style}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <>
      <Intro eyebrow="READY TO SHARE" title="Your link is ready.">
        One short address. All the places you want to share it.
      </Intro>
      <section
        className="panel result-panel"
        aria-label="Your short link result"
      >
        <div className="panel-heading">
          <span className="icon-tile">
            <Check />
          </span>
          <h2>Your short link</h2>
          <span className="small-label success-label">Created</span>
        </div>
        <div className="copy-row">
          <input
            ref={input}
            value={link.shortUrl}
            readOnly
            aria-label="Your short URL"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="button primary copy-button"
            onClick={copy}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div role="status" className="sr-only">
          {copied ? "Short link copied to clipboard." : ""}
        </div>
        <div className="result-grid">
          <div className="destination-block">
            <p className="section-label">ORIGINAL DESTINATION</p>
            <p className="destination-domain">
              {new URL(link.destination).hostname}
            </p>
            <p className="destination-url" dir="ltr">
              {link.destination}
            </p>
            <a
              href={`/preview?url=${encodeURIComponent(link.shortUrl)}`}
              className="text-link"
            >
              <Shield size={17} />
              Preview this link
              <Arrow size={16} />
            </a>
            <div className="result-note">
              <LinkIcon size={17} />
              <p>Your short alias lives after this site’s domain.</p>
            </div>
          </div>
          <div className="qr-block">
            <p className="section-label">SHARE AS QR</p>
            <div className="qr-image">
              <img
                src={svgDataUrl(svg)}
                alt={`QR code for ${link.shortUrl}`}
                width="220"
                height="220"
              />
            </div>
            <div className="style-picker" role="group" aria-label="QR style">
              {QR_STYLES.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={style === value}
                  onClick={() => setStyle(value)}
                >
                  {value[0]!.toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="button secondary download-button"
              onClick={download}
              disabled={downloading}
            >
              {downloading ? <Spinner /> : <Download />}Download PNG
            </button>
          </div>
        </div>
        <ErrorMessage message={error} />
      </section>
      <div className="result-bottom">
        <span>Small enough to share. Yours to name.</span>
        <button type="button" className="text-link" onClick={reset}>
          Create another link
          <Arrow size={17} />
        </button>
      </div>
    </>
  );
}

function Preview() {
  const [url, setUrl] = useState(
    () => new URLSearchParams(window.location.search).get("url") || "",
  );
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!validUrl(url)) {
      setError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    setBusy(true);
    try {
      setResult(await post<PreviewResult>("/api/preview", { url: url.trim() }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Intro eyebrow="LOOK BEFORE YOU OPEN" title="A clearer view of the link.">
        See the final destination, without opening it in your browser.
      </Intro>
      <section
        className="panel preview-form"
        aria-label="Preview a shortened URL"
      >
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <div className="field">
            <label htmlFor="preview-url">Paste a shortened URL</label>
            <input
              id="preview-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                setResult(null);
              }}
              placeholder="https://bit.ly/your-link"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={2048}
              required
            />
          </div>
          <ErrorMessage message={error} />
          <button className="button primary full" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Resolving destination…
              </>
            ) : (
              <>
                <Eye />
                Preview destination
                <Arrow />
              </>
            )}
          </button>
        </form>
      </section>
      {result && (
        <section
          className="panel preview-result"
          aria-label="Destination preview"
        >
          <div className="panel-heading">
            <span className="icon-tile">
              <Shield />
            </span>
            <div>
              <h2>Destination revealed</h2>
              <p className="heading-note">You’re still on URLShorten.</p>
            </div>
          </div>
          <dl className="preview-details">
            <div className="detail-url">
              <dt>Short URL</dt>
              <dd dir="ltr">{result.shortUrl}</dd>
            </div>
            <div className="detail-url final-destination">
              <dt>Final destination</dt>
              <dd dir="ltr">{result.destination}</dd>
            </div>
            <div className="facts">
              <div>
                <dt>Domain</dt>
                <dd>{result.domain}</dd>
              </div>
              <div>
                <dt>HTTPS</dt>
                <dd>{result.https ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Redirects</dt>
                <dd>{result.redirects}</dd>
              </div>
            </div>
          </dl>
          <details className="redirect-chain">
            <summary>
              View redirect chain{" "}
              <span>
                {result.redirects}{" "}
                {result.redirects === 1 ? "redirect" : "redirects"}
              </span>
            </summary>
            <ol>
              {result.chain.map((step, index) => (
                <li key={index}>
                  <span className="hop-status">{step.status}</span>
                  <span className="hop-url" dir="ltr">
                    {step.url}
                  </span>
                </li>
              ))}
            </ol>
          </details>
          <div className="open-row">
            <p>Review the address before continuing.</p>
            <a
              className="button primary"
              href={result.destination}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open destination
              <External size={16} />
            </a>
          </div>
        </section>
      )}
      <div className="preview-notice">
        <Shield size={18} />
        <p>
          A preview reveals where a link goes. It does not certify the website’s
          safety. Destinations can change later.
        </p>
      </div>
    </>
  );
}

function About() {
  return (
    <>
      <Intro eyebrow="A SMALL, USEFUL TOOL" title="Less link. Less friction.">
        Four useful things, kept simple.
      </Intro>
      <section className="panel about-panel">
        <div className="about-intro">
          <Brand />
          <p>
            URLShorten makes long addresses easier to share and hidden
            destinations easier to understand.
          </p>
        </div>
        <div className="about-features">
          <article>
            <span className="feature-number">01</span>
            <div>
              <h2>Short links that stay available</h2>
              <p>
                Your original URL is stored on the server, so the short link
                keeps working when you close your browser.
              </p>
            </div>
          </article>
          <article>
            <span className="feature-number">02</span>
            <div>
              <h2>A name that means something</h2>
              <p>
                Choose the alias after this site’s domain, like /portfolio or
                /research-2026. Random aliases are the default. Aliases belong
                to whoever creates them first.
              </p>
            </div>
          </article>
          <article>
            <span className="feature-number">03</span>
            <div>
              <h2>A QR code, ready to share</h2>
              <p>
                Classic, Rounded or Dots. Download a PNG of the selected style,
                with clear contrast and space around the code for reliable
                scanning.
              </p>
            </div>
          </article>
          <article>
            <span className="feature-number">04</span>
            <div>
              <h2>A look before you open</h2>
              <p>
                Preview the destination, domain, HTTPS use and HTTP redirect
                chain. The server blocks internal addresses and checks every
                redirect. You choose when to open the result.
              </p>
            </div>
          </article>
        </div>
        <div className="about-limits">
          <h2>A few boundaries</h2>
          <p>
            Preview is not a malware scan. It cannot follow JavaScript
            redirects, sign in to a website or guarantee what a destination will
            do later. Some services block automated requests. Short links are
            public; avoid private URLs or access tokens.
          </p>
          <p>
            You can customize an alias, not create an arbitrary domain. A
            different domain must be owned and configured for the site.
          </p>
        </div>
        <div className="author">
          <span>Designed and built by</span>
          <a href={AUTHOR} target="_blank" rel="noopener noreferrer">
            Mosaddiqur Rahman
            <External size={17} />
          </a>
        </div>
      </section>
    </>
  );
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a href="/" aria-label="URLShorten home">
            <Brand />
          </a>
          <nav aria-label="Main navigation">
            {[
              ["/", "Home"],
              ["/preview", "Preview"],
              ["/about", "About"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main
        id="main"
        className={path === "/about" ? "main about-main" : "main"}
      >
        {path === "/" ? (
          <Home />
        ) : path === "/preview" ? (
          <Preview />
        ) : path === "/about" ? (
          <About />
        ) : (
          <>
            <Intro eyebrow="LINK UNAVAILABLE" title="This page wasn’t found.">
              The address may be incomplete, or the short link may not exist.
            </Intro>
            <a href="/" className="button primary">
              Create a short link
              <Arrow />
            </a>
          </>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <span>© {new Date().getFullYear()} URLShorten</span>
          <span className="footer-purpose">
            Shorten. Share. See where it goes.
          </span>
          <a
            href={path === "/about" ? AUTHOR : "/about"}
            {...(path === "/about"
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {path === "/about" ? "Mosaddiqur Rahman ↗" : "Made by Mosaddiqur ↗"}
          </a>
        </div>
      </footer>
    </div>
  );
}
