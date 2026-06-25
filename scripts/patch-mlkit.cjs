// Applies two fixes to capacitor-mlkit-digitalink-plugin@0.4.1 that are needed
// for Android builds targeting API 33+:
//   1. Adds `namespace` to android/build.gradle (replaces deprecated `package=` in manifest)
//   2. Removes the `package=` attribute from AndroidManifest.xml
//
// This replaces patch-package, which fails cross-platform due to CRLF/LF context-line mismatches.
'use strict'

const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const pluginDir = join(__dirname, '..', 'node_modules', 'capacitor-mlkit-digitalink-plugin', 'android')

// 1. build.gradle — add namespace block if missing
const buildGradlePath = join(pluginDir, 'build.gradle')
if (existsSync(buildGradlePath)) {
  let src = readFileSync(buildGradlePath, 'utf8')
  if (!src.includes("namespace 'com.spoken.app.digitalink'")) {
    src = src.replace(/^(android\s*\{)/m, "$1\n    namespace 'com.spoken.app.digitalink'")
    writeFileSync(buildGradlePath, src)
    console.log('patch-mlkit: added namespace to build.gradle')
  }
}

// 2. AndroidManifest.xml — strip the package= attribute
const manifestPath = join(pluginDir, 'src', 'main', 'AndroidManifest.xml')
if (existsSync(manifestPath)) {
  let src = readFileSync(manifestPath, 'utf8')
  if (src.includes('package=')) {
    writeFileSync(
      manifestPath,
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n'
    )
    console.log('patch-mlkit: removed package= attribute from AndroidManifest.xml')
  }
}
