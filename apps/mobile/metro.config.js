// Metro has to be told about the monorepo twice: once so it watches the
// workspace root (otherwise edits to packages/flight-sim never trigger a
// reload), and once so it resolves modules from both node_modules trees, since
// pnpm keeps most of them at the root.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm symlinks every dependency, so Metro must follow links and must keep
// walking parent directories: a package in the store finds its own dependencies
// in a sibling node_modules, which disabling hierarchical lookup would hide.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
