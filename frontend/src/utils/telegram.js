function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

function getDevUser() {
  if (!import.meta.env.DEV) return null;
  const id = import.meta.env.VITE_DEV_TELEGRAM_ID;
  if (!id) return null;

  return {
    id: Number(id),
    username: import.meta.env.VITE_DEV_TELEGRAM_USERNAME || "dino_dev",
    first_name: import.meta.env.VITE_DEV_TELEGRAM_FIRST_NAME || "Dino",
    last_name: import.meta.env.VITE_DEV_TELEGRAM_LAST_NAME || "Developer",
    language_code: "en",
    is_premium: false
  };
}

export function initTelegramChrome() {
  const webApp = getTelegramWebApp();
  if (!webApp) return null;

  try {
    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.("#081229");
    webApp.setBackgroundColor?.("#081229");
  } catch {}

  return webApp;
}

export function getTelegramAuthPayload() {
  const webApp = getTelegramWebApp();
  const initData = webApp?.initData || "";
  if (initData) return { initData };

  const devUser = getDevUser();
  if (devUser) return { devUser };

  return null;
}

export function getTelegramViewerPreview() {
  const webApp = getTelegramWebApp();
  if (webApp?.initDataUnsafe?.user) return webApp.initDataUnsafe.user;
  return getDevUser();
}

export function isTelegramRuntimeAvailable() {
  return Boolean(getTelegramAuthPayload());
}

export function openTelegramInvoice(invoiceUrl) {
  const webApp = getTelegramWebApp();

  return new Promise((resolve, reject) => {
    try {
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, (status) => resolve(status));
        return;
      }

      if (typeof window !== "undefined") {
        window.open(invoiceUrl, "_blank", "noopener");
        resolve("opened");
        return;
      }

      reject(new Error("Invoice cannot be opened in this environment."));
    } catch (error) {
      reject(error);
    }
  });
}
