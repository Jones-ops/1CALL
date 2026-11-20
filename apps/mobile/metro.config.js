// Expo detects npm workspaces automatically; this keeps the defaults explicit.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
