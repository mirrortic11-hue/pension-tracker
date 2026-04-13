// config.js — app-wide constants and version enforcement.
// Loaded as a plain <script>, exposes globals used by the rest of the app.

const APP_VERSION = '2026-04-07-avg-fix-1';
const VERSION_KEY = 'pension_tracker_app_version';

// 캐시된 구버전 HTML을 피하기 위해 버전 쿼리로 1회 강제 갱신
(function enforceVersionedUrl() {
  const stored = localStorage.getItem(VERSION_KEY);
  const u = new URL(window.location.href);
  const currentV = u.searchParams.get('v');
  if (stored !== APP_VERSION || currentV !== APP_VERSION) {
    localStorage.setItem(VERSION_KEY, APP_VERSION);
    u.searchParams.set('v', APP_VERSION);
    window.location.replace(u.toString());
  }
})();

const SUPABASE_URL = "https://abonhubecflqlabcxgjd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFib25odWJlY2ZscWxhYmN4Z2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0Mjk5NDQsImV4cCI6MjA5MTAwNTk0NH0.7sA_PDCdywXJSbhUbChdVa6-zqpzkgv8zZf8lWHg6ZI";
const ACCOUNT_ID = "pension_1";
