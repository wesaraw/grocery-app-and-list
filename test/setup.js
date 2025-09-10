import { JSDOM } from 'jsdom';

// Provide a DOMParser implementation for Node-based tests
const { window } = new JSDOM();
global.DOMParser = window.DOMParser;
