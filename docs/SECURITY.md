# Security model

URLShorten reveals HTTP destinations; it does not certify a website as safe.
There are no malware scores, reputation stubs, page-content scans or ongoing
monitoring. The server's network policy applies in local and deployed operation;
there is no private-address bypass flag.

## URL and alias inputs

Only explicit HTTP/HTTPS URLs up to 2,048 characters are accepted. Embedded
credentials, control characters, bidi/zero-width markers, encoded controls and
backslashes are rejected. Query strings and fragments are preserved in storage.

Aliases are lowercase ASCII, 3–48 characters, starting with a letter or number.
Slashes, dots, percent encodings, control characters, query characters and
reserved routes are rejected. The alias is validated before it becomes a storage
key or filename. Custom alias reservations are atomic; generated names use
cryptographic randomness and bounded retries.

JSON bodies must be objects, use the JSON content type and remain within 8 KiB
even without a trustworthy Content-Length. Cross-origin browser POSTs are
rejected. The public endpoints require no authentication; rate limiting and
operator abuse handling remain necessary for a public shortener.

## SSRF protection

1. Block internal hostname suffixes, localhost and metadata names.
2. Permit website ports 80 and 443 and HTTP/HTTPS only.
3. Resolve the hostname through the system resolver with `all: true`.
4. Classify every returned IPv4/IPv6 address. Reject the whole result if any
   address is nonpublic, including private, loopback, link-local, metadata,
   carrier-grade NAT, documentation, benchmark, multicast and reserved space.
5. Pin the connection to one of those validated addresses. The client retains
   the original hostname for TLS/SNI and certificate identity checks, and does
   not perform a second DNS lookup.
6. Apply the same checks independently to every redirect target.

System hosts-file or NSS answers receive the same guard. DNS timeouts or empty
results fail closed. A timed-out system lookup cannot open an HTTP connection
later. IPv4 forms such as decimal or hexadecimal loopback are canonicalized by
the URL parser and then blocked. IPv4-mapped IPv6 is reclassified by its embedded
address; transition and non-global IPv6 ranges fail closed.

The own-origin exception reads a validated one-segment alias from storage.
It never opens a localhost/private connection to resolve the app's own links.
Stored destinations still pass the public-address guard.

## Fetch boundaries

| Boundary           | Limit                  |
| ------------------ | ---------------------- |
| DNS resolution     | 2 seconds              |
| One HTTP request   | 3 seconds, absolute    |
| Total preview      | 10 seconds             |
| Redirects          | 6, with loop detection |
| Response headers   | 16 KiB                 |
| GET fallback Range | bytes 0–65535          |
| Request JSON       | 8 KiB                  |

HEAD is preferred. Only 405/501 triggers GET fallback. The response is closed as
soon as headers arrive, even if Range is ignored; no body is buffered,
decompressed, parsed or executed. There are no cookies, authorization headers,
browser identities, user referrers or forwarded input headers. Invalid TLS
certificates and hostname mismatches fail the request.

## Redirects and errors

Mappings are immutable through the public API. Destinations are revalidated
before a 302 response, including a fresh DNS check. Responses are not cached,
short-URL query parameters are not forwarded, and internal record identifiers
are not exposed.

API errors use friendly messages. Unexpected errors and storage failures return
a generic unavailable response; no stack, token, raw DNS answer or internal
exception text is returned. Netlify adds CSP, frame, permissions, content-type
and referrer protections.

Netlify applies platform limits of 20 creations and 30 previews per minute per
IP/domain. The Vite development middleware does not simulate these platform
limits. Deploy previews use a separate mapping store from production.

## Privacy and limitations

There is no click logging, visitor analytics, login, cookie or tracking script.
Netlify can retain infrastructure logs under the site's account settings.
Mapping records contain a destination, alias and creation time.

Short links are public. Do not use them to store private destinations or access
tokens. A preview describes a single HTTP resolution at that moment; destinations
can change, vary by visitor or use redirects requiring browser JavaScript or
authentication. The operator can remove abusive mappings in the Blobs UI.

Report a security issue privately to the project maintainer before sharing
exploit details publicly.
