import { SiYoutube, SiInstagram, SiTiktok, SiPinterest, SiX, SiFacebook, SiDiscord } from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa6";
import type { IconType } from "react-icons";

export type PlatformKey = "youtube" | "instagram" | "tiktok" | "pinterest" | "x" | "linkedin" | "facebook" | "discord";

const ICONS: Record<PlatformKey, IconType> = {
  youtube: SiYoutube,
  instagram: SiInstagram,
  tiktok: SiTiktok,
  pinterest: SiPinterest,
  x: SiX,
  linkedin: FaLinkedinIn,
  facebook: SiFacebook,
  discord: SiDiscord,
};

export function PlatformIcon({ platform, size = 16, className = "" }: { platform: PlatformKey; size?: number; className?: string }) {
  const Icon = ICONS[platform];
  return <Icon size={size} className={className} />;
}
