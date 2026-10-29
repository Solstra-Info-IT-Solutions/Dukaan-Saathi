// Metro config for the app. Kept explicitly so Metro never picks up a metro.config.js from a parent folder
// (Metro searches upwards when the app has none). Expo's defaults already handle this npm-workspaces monorepo.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
