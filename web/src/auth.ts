import Keycloak from 'keycloak-js';
import { demoMode } from './api';

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8082',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'jupiter',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'jupiter-web',
});

export const authInitialization = demoMode ? Promise.resolve(false) : keycloak.init({
  onLoad: 'check-sso',
  pkceMethod: 'S256',
  checkLoginIframe: false,
});