// src/components/Icons.jsx
import React from "react";

const S = ({ children, ...p }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
);

export const IconHome = (p) => (
  <S {...p}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </S>
);
export const IconPlan = (p) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4M8 14h2M8 18h2M14 14h2" />
  </S>
);
export const IconChat = (p) => (
  <S {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </S>
);
export const IconRuns = (p) => (
  <S {...p}>
    <path d="M3 18l5-6 4 3 5-7 4 4" />
    <circle cx="17" cy="5" r="1.5" />
  </S>
);
export const IconBolt = (p) => (
  <S {...p}>
    <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
  </S>
);
export const IconCheck = (p) => (
  <S {...p}>
    <path d="M20 6L9 17l-5-5" />
  </S>
);
export const IconUpload = (p) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </S>
);
export const IconSend = (p) => (
  <S {...p}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </S>
);
export const IconRunner = (p) => (
  <S {...p}>
    <circle cx="13" cy="4" r="2" />
    <path d="M5 21l3-6 4 2 1 5M12 17l-2-5 4-3 3 3 3 1" />
  </S>
);
