// Tiny inline-SVG icon set. No image requests, scales crisply, inherits `currentColor`.
// Kept deliberately simple/recognizable — icons reinforce meaning for low-literacy
// users (CLAUDE.md §1). Add new names here as the UI grows.

export type IconName =
  | "person"
  | "female"
  | "male"
  | "calendar"
  | "book"
  | "cigarette"
  | "pill"
  | "brain"
  | "gauge"
  | "droplet"
  | "heart"
  | "flask"
  | "scale"
  | "clipboard"
  | "check"
  | "cross"
  | "edit"
  | "arrow-left"
  | "doctor"
  | "speaker"
  | "stop"
  | "camera"
  | "image"
  | "upload"
  | "search"
  | "phone"
  | "location"
  | "plus"
  | "minus"
  | "question"
  | "ruler"
  | "graduation";

const PATHS: Record<IconName, React.ReactNode> = {
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </>
  ),
  female: (
    <>
      <circle cx="12" cy="8" r="4.5" />
      <path d="M12 12.5V21M9 18h6" />
    </>
  ),
  male: (
    <>
      <circle cx="10" cy="14" r="4.5" />
      <path d="M13.5 10.5 20 4M15 4h5v5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17M8 3v4M16 3v4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-1.8-1.3-4-2-7-2v13c3 0 5.2.7 7 2 1.8-1.3 4-2 7-2V4c-3 0-5.2.7-7 2Z" />
      <path d="M12 6v13" />
    </>
  ),
  cigarette: (
    <>
      <rect x="2.5" y="13" width="15" height="4" rx="1" />
      <path d="M14.5 13v4M19 8c1 1 1 2.5 0 3.5M16 9c.7.7.7 1.8 0 2.5" />
    </>
  ),
  pill: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)" />
      <path d="M9.5 9.5 14.5 14.5" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4.5A3 3 0 0 0 6 9a3 3 0 0 0-1 5.8A3 3 0 0 0 9 19.5V4.5Z" />
      <path d="M15 4.5A3 3 0 0 1 18 9a3 3 0 0 1 1 5.8A3 3 0 0 1 15 19.5V4.5Z" />
      <path d="M9 4.5h6M9 19.5h6M12 7v10" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-4" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  droplet: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" />,
  heart: (
    <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-4.5 8A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  scale: (
    <>
      <rect x="3.5" y="4" width="17" height="17" rx="3" />
      <path d="M12 8a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3ZM12 8V6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a3 3 0 0 1 6 0M9 11h6M9 15h6" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </>
  ),
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  doctor: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1M12 14v3M12 17a2 2 0 1 0 4 0v-1" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9.5a3.2 3.2 0 0 1 0 5M18.6 7a6.5 6.5 0 0 1 0 10" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" />,
  camera: (
    <>
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
  ),
  location: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.3a2.8 2.8 0 0 1 5.3 1c0 1.8-2.7 2.3-2.7 4" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  ruler: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-45 12 12)" />
      <path d="M8.5 8.5l1.5 1.5M11 6l2 2M13.5 3.5l1.5 1.5" />
    </>
  ),
  graduation: (
    <>
      <path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z" />
      <path d="M6 10.5V15c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Set when the icon conveys meaning on its own (rare — usually decorative). */
  title?: string;
}

export default function Icon({ name, size = 24, className, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
