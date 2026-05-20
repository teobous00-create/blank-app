'use strict';
// Hardcoded autolinking output — bypasses `react-native config` which
// crashes silently in CI, causing the RNGP to report "packageName not found".
const path = require('path');
const root = path.resolve(__dirname, '..');

const android = (pkg, importPath, instance) => ({
  root: path.join(root, 'node_modules', pkg),
  name: pkg,
  platforms: {
    android: {
      sourceDir: path.join(root, 'node_modules', pkg, 'android'),
      packageImportPath: importPath,
      packageInstance: instance,
      buildTypes: [],
      libraryName: null,
      componentDescriptors: [],
      cmakeListsPath: null,
      cxxModuleCMakeListsModuleName: null,
      cxxModuleCMakeListsPath: null,
      cxxModuleHeaderName: null,
      androidMkPath: null,
      dependencyConfiguration: null,
    },
  },
});

const result = {
  project: {
    android: {
      packageName: 'com.androidagent',
      sourceDir: path.join(root, 'android'),
      appName: 'app',
      packageFolder: 'com/androidagent',
      dependencyConfiguration: null,
      watchModeCommandParams: null,
      folder: root,
    },
  },
  reactNativeVersion: '0.76.5',
  dependencies: {
    '@react-native-async-storage/async-storage': android(
      '@react-native-async-storage/async-storage',
      'import com.reactnativecommunity.asyncstorage.AsyncStoragePackage;',
      'new AsyncStoragePackage()',
    ),
    'react-native-permissions': android(
      'react-native-permissions',
      'import com.zoontek.rnpermissions.RNPermissionsPackage;',
      'new RNPermissionsPackage()',
    ),
  },
};

process.stdout.write(JSON.stringify(result));
