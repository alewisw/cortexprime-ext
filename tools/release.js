#!/usr/bin/env node
// Tags the version declared in system.json, pushes it, builds the
// distributable zip, and publishes a GitHub release with that zip attached.
// Usage: npm run release

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// npm itself is a .cmd shim on Windows, not a real executable. execFileSync resolves the command
// directly via the OS loader, so plain "npm" fails with ENOENT there; renaming it to "npm.cmd"
// alone still fails (EINVAL) because Node refuses to spawn a .cmd/.bat file without shell:true.
// Only npm needs this; git and gh are real binaries on every platform. The args passed to it here
// are always fixed literals, never external input, so shell:true carries no injection risk.
const isWindowsNpm = command => command === 'npm' && process.platform === 'win32'
const resolveCommand = command => isWindowsNpm(command) ? 'npm.cmd' : command

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(resolveCommand(command), args, { cwd: ROOT, stdio: 'inherit', shell: isWindowsNpm(command) })
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function fail(message) {
  console.error(`\nrelease aborted: ${message}`)
  process.exit(1)
}

const system = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const { id, version, url, download } = system
const tag = `v${version}`
const zipName = `${id}-${version}.zip`
const zipPath = path.join('dist', zipName)

const repoMatch = /github\.com\/([^/]+\/[^/]+?)(\.git)?$/.exec(url || '')
if (!repoMatch) {
  fail(`could not determine the GitHub repo (owner/name) from system.json's "url" field: ${url}`)
}
const repo = repoMatch[1]

if (version !== pkg.version) {
  fail(`system.json version (${version}) does not match package.json version (${pkg.version}) — bump both before releasing.`)
}

const expectedDownload = `https://github.com/${repo}/releases/download/${tag}/${zipName}`
if (download !== expectedDownload) {
  fail(`system.json's "download" field is stale.\n  found:    ${download}\n  expected: ${expectedDownload}\nUpdate it before releasing, so Foundry installs fetch the version this release actually publishes.`)
}

if (capture('git', ['status', '--porcelain'])) {
  fail('working tree is not clean — commit or stash changes before releasing.')
}

const existingTags = capture('git', ['tag', '--list']).split('\n')
if (existingTags.includes(tag)) {
  fail(`tag ${tag} already exists — bump the version in system.json and package.json first.`)
}

try {
  capture('gh', ['auth', 'status'])
} catch {
  fail('gh CLI is not authenticated — run "gh auth login" first.')
}

run('npm', ['run', 'package'])

if (!fs.existsSync(path.join(ROOT, zipPath))) {
  fail(`expected package at ${zipPath} but it was not found.`)
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
run('git', ['tag', '-a', tag, '-m', tag])
run('git', ['push', 'origin', branch])
run('git', ['push', 'origin', tag])
run('gh', ['release', 'create', tag, zipPath, '--repo', repo, '--title', tag, '--generate-notes'])

const manifestUrl = `https://raw.githubusercontent.com/${repo}/${tag}/system.json`
console.log(`\nReleased ${tag}.`)
console.log(`Manifest URL for a direct "Install System" (bypasses hosts' Bazaar-style package lookups):`)
console.log(manifestUrl)
