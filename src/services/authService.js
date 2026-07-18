const AUTH_SESSION_STORAGE_KEY = "neurodiary-auth-session-v1";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const APPLE_SCRIPT_URL = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

function trimTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

function randomToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `rnd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadScript(src, globalKey) {
  if (globalKey && globalThis[globalKey]) {
    return Promise.resolve();
  }

  const existing = document.querySelector(`script[data-src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
      if (globalKey && globalThis[globalKey]) {
        resolve();
      }
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.src = src;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
    document.head.append(script);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.detail ?? `Request failed with HTTP ${response.status}.`);
  }

  return payload;
}

export function createDefaultAuthConfig() {
  return {
    googleEnabled: false,
    googleClientId: "",
    appleEnabled: false,
    appleClientId: "",
    appleRedirectPath: "/auth/apple/callback",
    legacyApiTokenEnabled: false,
    federatedAuthEnabled: false,
  };
}

export function loadStoredAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw);
    if (!session?.accessToken || !session?.user) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function saveAuthSession(session) {
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function getAuthorizationHeaderValue() {
  const session = loadStoredAuthSession();
  if (!session?.accessToken) {
    return "";
  }

  return `Bearer ${session.accessToken}`;
}

export async function fetchAuthConfig() {
  return {
    ...createDefaultAuthConfig(),
    ...(await fetchJson("/api/v1/auth/config")),
  };
}

export async function exchangeIdentityToken({ provider, idToken, nonce = "", profile = null }) {
  const result = await fetchJson("/api/v1/auth/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider,
      idToken,
      nonce,
      profile,
    }),
  });

  return saveAuthSession(result);
}

export async function renderGoogleSignInButton(target, clientId, onCredential) {
  if (!target || !clientId) {
    return;
  }

  await loadScript(GOOGLE_SCRIPT_URL, "google");
  target.replaceChildren();
  globalThis.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response?.credential) {
        onCredential(response.credential);
      }
    },
  });
  globalThis.google.accounts.id.renderButton(target, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "signin_with",
    width: 260,
  });
}

export function resolveAppleRedirectUri(appleRedirectPath) {
  if (!appleRedirectPath) {
    return `${trimTrailingSlash(globalThis.location?.origin ?? "")}/auth/apple/callback`;
  }

  if (/^https?:\/\//i.test(appleRedirectPath)) {
    return appleRedirectPath;
  }

  const baseOrigin = trimTrailingSlash(globalThis.location?.origin ?? "");
  const relativePath = appleRedirectPath.startsWith("/") ? appleRedirectPath : `/${appleRedirectPath}`;
  return `${baseOrigin}${relativePath}`;
}

export async function startAppleSignIn({ clientId, redirectPath }) {
  if (!clientId) {
    throw new Error("Apple sign-in is not configured for this app.");
  }

  await loadScript(APPLE_SCRIPT_URL, "AppleID");
  const nonce = randomToken();
  const state = randomToken();
  globalThis.AppleID.auth.init({
    clientId,
    scope: "name email",
    redirectURI: resolveAppleRedirectUri(redirectPath),
    state,
    nonce,
    usePopup: true,
  });

  const result = await globalThis.AppleID.auth.signIn();
  return {
    nonce,
    idToken: result?.authorization?.id_token ?? "",
    profile: result?.user
      ? {
          email: result.user.email ?? "",
          firstName: result.user.name?.firstName ?? "",
          lastName: result.user.name?.lastName ?? "",
        }
      : null,
  };
}
