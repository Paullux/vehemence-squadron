import { assetUrl } from './assetUrl.js';

const CONSENT_KEY = 'vehemence.analyticsConsent';
const CONFIG_PATH = '/analytics-config.json';

let analyticsConfig = null;
let configLoaded = false;
let configPromise = null;
let consent = localStorage.getItem(CONSENT_KEY);

function sanitizeEventName(eventName) {
  return String(eventName || 'event').replace(/[^a-z0-9_:-]/gi, '_').slice(0, 64);
}

function sanitizePayload(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [String(key).slice(0, 48), typeof value === 'number' ? value : String(value).slice(0, 120)])
  );
}

async function loadAnalyticsConfig() {
  if (configLoaded) return analyticsConfig;
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const response = await fetch(assetUrl(CONFIG_PATH), { cache: 'no-store' });
        if (!response.ok) return null;
        analyticsConfig = await response.json();
      } catch {
        analyticsConfig = null;
      }
      configLoaded = true;
      return analyticsConfig;
    })();
  }
  return configPromise;
}

function canTrack() {
  return consent === 'accepted' && analyticsConfig?.enabled && analyticsConfig?.endpoint;
}

function postGenericEvent(eventName, payload) {
  const body = JSON.stringify({
    site: analyticsConfig.site || 'vehemence-squadron',
    event: sanitizeEventName(eventName),
    path: location.pathname,
    title: document.title,
    referrer: document.referrer ? new URL(document.referrer).origin : '',
    timestamp: new Date().toISOString(),
    data: sanitizePayload(payload),
  });
  const blob = new Blob([body], { type: 'application/json' });
  if (navigator.sendBeacon?.(analyticsConfig.endpoint, blob)) return;
  fetch(analyticsConfig.endpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    mode: analyticsConfig.corsMode || 'cors',
  }).catch(() => {});
}

function trackGoatCounterEvent(eventName, payload) {
  const url = new URL(analyticsConfig.endpoint);
  url.searchParams.set('p', `${location.pathname}#${sanitizeEventName(eventName)}`);
  url.searchParams.set('t', document.title);
  const eventPayload = sanitizePayload(payload);
  if (eventPayload.missionId) url.searchParams.set('e', String(eventPayload.missionId));
  fetch(url.toString(), { mode: 'no-cors', keepalive: true }).catch(() => {});
}

function trackMatomoEvent(eventName, payload) {
  const eventPayload = sanitizePayload(payload);
  const event = sanitizeEventName(eventName);
  const url = new URL(analyticsConfig.endpoint);
  url.searchParams.set('idsite', String(analyticsConfig.siteId || 1));
  url.searchParams.set('rec', '1');
  url.searchParams.set('apiv', '1');
  url.searchParams.set('rand', String(Math.floor(Math.random() * 1000000000)));
  url.searchParams.set('url', location.href);
  url.searchParams.set('action_name', document.title);
  url.searchParams.set('send_image', '0');
  if (document.referrer) url.searchParams.set('urlref', document.referrer);
  if (event !== 'page_view') {
    url.searchParams.set('e_c', 'vehemence-squadron');
    url.searchParams.set('e_a', event);
    if (eventPayload.missionId) url.searchParams.set('e_n', String(eventPayload.missionId));
    if (typeof eventPayload.score === 'number') url.searchParams.set('e_v', String(Math.max(0, Math.floor(eventPayload.score))));
  }
  fetch(url.toString(), { mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => {});
}

export function hasAnalyticsConsent() {
  return consent === 'accepted';
}

export async function initAnalytics({ banner, accept, reject } = {}) {
  await loadAnalyticsConfig();
  const closeBanner = () => banner?.classList.add('hidden');

  if (!consent) banner?.classList.remove('hidden');
  else closeBanner();

  accept?.addEventListener('click', () => {
    consent = 'accepted';
    localStorage.setItem(CONSENT_KEY, consent);
    closeBanner();
    trackEvent('page_view');
  });

  reject?.addEventListener('click', () => {
    consent = 'rejected';
    localStorage.setItem(CONSENT_KEY, consent);
    closeBanner();
  });

  if (consent === 'accepted') trackEvent('page_view');
}

export async function trackEvent(eventName, data = {}) {
  if (consent !== 'accepted') return;
  await loadAnalyticsConfig();
  if (!canTrack()) return;
  if (analyticsConfig.provider === 'goatcounter') {
    trackGoatCounterEvent(eventName, data);
    return;
  }
  if (analyticsConfig.provider === 'matomo') {
    trackMatomoEvent(eventName, data);
    return;
  }
  postGenericEvent(eventName, data);
}
