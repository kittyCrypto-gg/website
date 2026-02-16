export const BACKEND_URL = 'https://srv.kittycrypto.gg';
export const RSS_BACKEND_URL = 'https://rss.kittycrypto.gg/rss/kittycrypto';

if (!BACKEND_URL) {
    throw new Error("PUBLIC_BACKEND_URL is not defined");
}

if (!RSS_BACKEND_URL) {
    throw new Error("RSS_BACKEND_URL is not defined");
}

export const chatURL = `${BACKEND_URL}/chat`;
export const chatStreamURL = `${BACKEND_URL}/chat/stream`;
export const sessionTokenURL = `${BACKEND_URL}/session-token`;
export const sessionReregisterURL = `${BACKEND_URL}/session-token/reregister`;
export const getIpURL = `${BACKEND_URL}/get-ip`;
export const commentPostURL = `${BACKEND_URL}/comment`;
export const commentLoadURL = `${BACKEND_URL}/comments/load`;
export const storiesIndexURL = `${BACKEND_URL}/stories.json`;
export const storiesURL = `${BACKEND_URL}/stories`;