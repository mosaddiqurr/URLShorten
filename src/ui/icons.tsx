import type { ReactNode } from "react";

type Props = { size?: number; className?: string };
function Icon({
  size = 18,
  className,
  children,
}: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
export const LinkIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" />
  </Icon>
);
export const Arrow = (p: Props) => (
  <Icon {...p}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Icon>
);
export const Eye = (p: Props) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const Shield = (p: Props) => (
  <Icon {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);
export const Copy = (p: Props) => (
  <Icon {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);
export const Check = (p: Props) => (
  <Icon {...p}>
    <path d="m20 6-11 11-5-5" />
  </Icon>
);
export const Download = (p: Props) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Icon>
);
export const External = (p: Props) => (
  <Icon {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
);
export const Spinner = (p: Props) => (
  <Icon {...p} className="spinner">
    <circle cx="12" cy="12" r="9" opacity=".2" />
    <path d="M21 12a9 9 0 0 0-9-9" />
  </Icon>
);
