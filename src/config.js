// config.js — app-wide constants and version enforcement.
// Loaded as a plain <script>, exposes globals used by the rest of the app.

const APP_VERSION = '2026-04-13-modular-2';
const VERSION_KEY = 'pension_tracker_app_version';

// 캐시된 구버전 HTML을 피하기 위해 버전 변경 시 1회 하드 리로드.
// sessionStorage 게이트로 같은 세션 내 무한 루프를 원천 차단한다.
(function enforceVersionedUrl() {
  const SESSION_GATE = 'pension_tracker_reloaded_for_' + APP_VERSION;
  if (sessionStorage.getItem(SESSION_GATE)) return;
  const stored = localStorage.getItem(VERSION_KEY);
  if (stored !== APP_VERSION) {
    localStorage.setItem(VERSION_KEY, APP_VERSION);
    sessionStorage.setItem(SESSION_GATE, '1');
    window.location.reload();
  }
})();

const SUPABASE_URL = "https://abonhubecflqlabcxgjd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFib25odWJlY2ZscWxhYmN4Z2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0Mjk5NDQsImV4cCI6MjA5MTAwNTk0NH0.7sA_PDCdywXJSbhUbChdVa6-zqpzkgv8zZf8lWHg6ZI";
const ACCOUNT_ID = "pension_1";
