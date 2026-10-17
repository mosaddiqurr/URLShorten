export interface StoredLink {
  version: 1;
  alias: string;
  destination: string;
  createdAt: string;
}

export interface CreatedLink {
  alias: string;
  shortUrl: string;
  destination: string;
  createdAt: string;
}

export interface RedirectStep {
  url: string;
  status: number;
  target?: string;
}

export interface PreviewResult {
  shortUrl: string;
  destination: string;
  domain: string;
  https: boolean;
  redirects: number;
  chain: RedirectStep[];
  checkedAt: string;
}
