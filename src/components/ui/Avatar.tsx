import { useEffect, useState } from "react";
import {
  AVATAR_EVENT,
  avatarKey,
  getCustomAvatar,
} from "@/services/avatar";

interface AvatarUser {
  name: string;
  email?: string;
  id?: string;
  avatar?: string;
}

interface AvatarProps {
  user: AvatarUser | null | undefined;
  size?: number;
  className?: string;
}

function isUsableUrl(url: string | undefined): url is string {
  return typeof url === "string" && /^(https?:\/\/|data:image\/)/.test(url);
}

/**
 * Avatar: bozuk görsel URL'lerinde tarayıcının "kırık resim" ikonunu göstermez,
 * otomatik olarak baş harflere düşer. Kullanıcının yüklediği fotoğraf önceliklidir.
 */
export default function Avatar({ user, size = 32, className = "" }: AvatarProps) {
  const key = user ? avatarKey(user) : "";
  const [custom, setCustom] = useState<string | null>(() =>
    key ? getCustomAvatar(key) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCustom(key ? getCustomAvatar(key) : null);
    setFailed(false);
  }, [key]);

  useEffect(() => {
    const handler = () => {
      setCustom(key ? getCustomAvatar(key) : null);
      setFailed(false);
    };
    window.addEventListener(AVATAR_EVENT, handler);
    return () => window.removeEventListener(AVATAR_EVENT, handler);
  }, [key]);

  const remote = isUsableUrl(custom ?? undefined) ? custom : isUsableUrl(user?.avatar) ? user!.avatar : null;
  const src = failed ? null : remote;
  const initial = (user?.name?.trim().charAt(0) || "?").toUpperCase();

  if (!src) {
    return (
      <div
        className={`rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary overflow-hidden ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
        title={user?.name}
        aria-label={user?.name}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={user?.name ?? "Profil"}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-full object-cover border border-border ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
