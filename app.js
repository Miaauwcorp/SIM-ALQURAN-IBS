import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging.js";

/* =========================
   KONFIGURASI WAJIB DIGANTI
========================= */

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxv29VDLzUWt-J6rEL-KcqylOGqilnPiijfibo-xj6mX7Pu3kAz6l1av9OkMddtX_Kw-Q/exec";

const PUBLIC_VAPID_KEY = "BKmxbHoI8YyOj-sImQzpEQMBTBGbxEn8aP_gDvVo9YCtaGQi5moPe08MM422VwWRZumhJhIhsL7aXGQv0GsidDs";

const firebaseConfig = {
  apiKey: "AIzaSyDyrFJdjJ9rDoWy6I7ZudX-fkIWG_xmgMs",
  authDomain: "sim-murojaah-ibs.firebaseapp.com",
  projectId: "sim-murojaah-ibs",
  storageBucket: "sim-murojaah-ibs.firebasestorage.app",
  messagingSenderId: "619856511119",
  appId: "1:619856511119:web:45f8380340724f7d79f0fa",
  measurementId: "G-9XDC3584RS"
};

/* =========================
   INIT FIREBASE
========================= */

const app = initializeApp(firebaseConfig);

let messaging = null;
let serviceWorkerRegistration = null;

function setStatus(text) {
  const el = document.getElementById("push-status");
  if (el) el.textContent = text;
}

function getCurrentUserPayload(extraPayload = {}) {
  const userId =
    extraPayload.userId ||
    document.getElementById("user-id")?.value ||
    localStorage.getItem("sim_user_id") ||
    "anonymous";

  const name =
    extraPayload.name ||
    document.getElementById("user-name")?.value ||
    localStorage.getItem("sim_user_name") ||
    userId;

  return {
    userId: String(userId).trim(),
    name: String(name).trim(),
    role: String(extraPayload.role || "").trim(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || ""
  };
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Browser ini belum mendukung Service Worker.");
  }

  if (!serviceWorkerRegistration) {
    serviceWorkerRegistration = await navigator.serviceWorker.register("./sw.js");
  }

  return serviceWorkerRegistration;
}

async function sendTokenToGas(token, userPayload) {
  const payload = {
    action: "save_fcm_token",
    token,
    ...userPayload
  };

  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",

    // text/plain menghindari preflight OPTIONS yang sering bermasalah di GAS.
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify(payload)
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    return {
      success: response.ok,
      raw: text
    };
  }
}

export async function enablePushNotification(extraPayload = {}) {
  try {
    setStatus("Memeriksa dukungan browser...");

    const supported = await isSupported();
    if (!supported) {
      throw new Error("Firebase Messaging belum didukung di browser ini.");
    }

    if (!("Notification" in window)) {
      throw new Error("Browser ini belum mendukung Notification API.");
    }

    setStatus("Meminta izin notifikasi...");
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Izin notifikasi tidak diberikan oleh user.");
    }

    const swReg = await ensureServiceWorker();

    messaging = getMessaging(app);

    setStatus("Mengambil token FCM browser...");
    const token = await getToken(messaging, {
      vapidKey: PUBLIC_VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) {
      throw new Error("Token FCM tidak berhasil dibuat.");
    }

    const userPayload = getCurrentUserPayload(extraPayload);

    setStatus("Menyimpan token ke Google Sheets...");
    const saveResult = await sendTokenToGas(token, userPayload);

    if (!saveResult.success) {
      throw new Error(saveResult.message || "Token gagal disimpan ke backend.");
    }

    localStorage.setItem("sim_fcm_token", token);
    localStorage.setItem("sim_user_id", userPayload.userId);
    localStorage.setItem("sim_user_name", userPayload.name);

    setStatus(
      "Notifikasi aktif.\n" +
      "User: " + userPayload.name + "\n" +
      "Token tersimpan di Google Sheets."
    );

    return {
      success: true,
      token
    };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    setStatus("Gagal mengaktifkan notifikasi: " + message);

    return {
      success: false,
      message
    };
  }
}

/* Tombol di index.html */
window.enablePushFromButton = function () {
  enablePushNotification();
};

/* Foreground notification: saat tab sedang terbuka */
async function installForegroundListener() {
  try {
    const supported = await isSupported();
    if (!supported) return;

    messaging = getMessaging(app);

    onMessage(messaging, function (payload) {
      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "Notifikasi";

      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        "";

      const url =
        payload?.data?.url ||
        payload?.fcmOptions?.link ||
        "./";

      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "./icon-192.png",
          data: { url }
        });
      }
    });
  } catch (err) {
    console.warn("Foreground listener gagal:", err);
  }
}

installForegroundListener();

/* Bridge untuk sistem Anda yang memakai iframe GAS */
window.addEventListener("message", async function (event) {
  const data = event.data || {};

  if (data.type !== "SIM_FCM_ENABLE_REQUEST") return;

  const result = await enablePushNotification(data.payload || {});

  const iframe = document.getElementById("app");
  const target = event.source || iframe?.contentWindow;

  if (target && typeof target.postMessage === "function") {
    target.postMessage({
      type: "SIM_FCM_ENABLE_RESULT",
      requestId: data.requestId || "",
      ...result
    }, "*");
  }
});
