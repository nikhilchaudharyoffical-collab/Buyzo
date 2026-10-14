import { useState } from "react";

// Real brand icons live in /public/upi/<key>.png. If a file is missing the coloured badge shows instead.
const BRANDS = {
  upi: { name: "UPI", badge: "UPI", color: "#097939" },
  gpay: { name: "Google Pay", badge: "G", color: "#1a73e8" },
  phonepe: { name: "PhonePe", badge: "Pe", color: "#5f259f" },
  paytm: { name: "Paytm", badge: "Pt", color: "#00a3d9" },
} as const;

export type PayBrand = keyof typeof BRANDS;

export function PayIcon({ brand, size = 28 }: { brand: PayBrand; size?: number }) {
  const [failed, setFailed] = useState(false);
  const b = BRANDS[brand];
  if (failed) {
    return (
      <span className="pay-icon pay-icon-fallback" style={{ width: size, height: size, background: b.color, fontSize: size * 0.38 }}>
        {b.badge}
      </span>
    );
  }
  return (
    <img
      className="pay-icon"
      src={`${import.meta.env.BASE_URL}upi/${brand}.png`}
      alt={b.name}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
