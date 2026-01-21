export const host = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:1999"
