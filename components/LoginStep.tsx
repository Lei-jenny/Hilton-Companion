const isBrowser = () => typeof window !== 'undefined';

export const getImageCache = async (key: string): Promise<string | null> => {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setImageCache = async (key: string, value: string | null): Promise<void> => {
  if (!isBrowser() || !value) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore cache write failures
  }
};
