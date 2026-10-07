// In the Android app the page is served from the device (https://localhost), so
// relative API calls like fetch('/api/chat') must be sent to the real server.
// Web builds leave VITE_API_URL unset and keep same-origin requests.
const API = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

if (API) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    nativeFetch(typeof input === 'string' && input.startsWith('/') ? API + input : input, init);
}

export default API;
