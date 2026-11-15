/**
 * Profil fotoğrafı.
 * Firebase'den gelen avatar URL'si kırık olabiliyor (hotlink/expiry).
 * Bu yüzden kullanıcı kendi fotoğrafını yükleyebilir; küçük data URL
 * olarak yalnızca bu cihazda saklanır.
 */

const STORAGE_KEY = "adaptime-avatar-v1";
export const AVATAR_EVENT = "adaptime:avatar-changed";

type AvatarMap = Record<string, string>;

function readMap(): AvatarMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as AvatarMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: AvatarMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* kota doldu */
  }
  window.dispatchEvent(new Event(AVATAR_EVENT));
}

export function avatarKey(user: { email?: string; id?: string; name?: string }): string {
  return user.email || user.id || user.name || "me";
}

export function getCustomAvatar(key: string): string | null {
  const map = readMap();
  return map[key] ?? null;
}

export function setCustomAvatar(key: string, dataUrl: string): void {
  const map = readMap();
  map[key] = dataUrl;
  writeMap(map);
}

export function removeCustomAvatar(key: string): void {
  const map = readMap();
  delete map[key];
  writeMap(map);
}

/** Dosyayı küçük bir data URL'ye çevirir (max ~600 KB). */
export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Sadece görsel dosyası seçebilirsin"));
      return;
    }
    if (file.size > 600_000) {
      reject(new Error("Görsel çok büyük (max 600 KB)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Görsel okunamadı"));
    };
    reader.onerror = () => reject(new Error("Görsel okunamadı"));
    reader.readAsDataURL(file);
  });
}
