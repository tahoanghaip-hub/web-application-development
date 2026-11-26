// Only display preferences are persisted in this browser.
export class StorageAdapter {
  static get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The current page still uses the selected theme.
    }
  }
}
