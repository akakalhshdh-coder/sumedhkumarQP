/** Creator social links. Edit here only; every button in the app reads from this file. */
export const SOCIAL = {
  youtube: {
    label: "Subscribe on YouTube",
    url: "https://www.youtube.com/@sumedhhkumar?sub_confirmation=1",
  },
  instagram: {
    label: "Follow on Instagram",
    url: "https://www.instagram.com/sumedhhkumar.ai/",
    appUrl: "instagram://user?username=sumedhhkumar.ai",
  },
  brand: "SUMEDHHKUMAR.ai",
  creator: "Sumedh Kumar",
} as const;

export const SUPPORT_SEEN_KEY = "qp_support_seen";
export const SOCIAL_TOAST_KEY = "qp_social_toast_seen";

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Open a social link in a new tab. On mobile, try the Instagram app first and
 * fall back to the web URL. We never verify follows and never gate features.
 */
export function openSocial(kind: "youtube" | "instagram"): void {
  if (kind === "instagram" && isMobile()) {
    const started = Date.now();
    window.location.href = SOCIAL.instagram.appUrl;
    window.setTimeout(() => {
      if (Date.now() - started < 1600 && document.visibilityState === "visible") {
        window.open(SOCIAL.instagram.url, "_blank", "noopener,noreferrer");
      }
    }, 1200);
    return;
  }
  window.open(SOCIAL[kind].url, "_blank", "noopener,noreferrer");
}

export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem("__qp", "1");
    s.removeItem("__qp");
    return s;
  } catch {
    return null;
  }
}
