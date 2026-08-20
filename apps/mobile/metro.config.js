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
// pnpm symlinks every dependency; without this Metro resolves through the link
// and then fails to find the package's own dependencies.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
