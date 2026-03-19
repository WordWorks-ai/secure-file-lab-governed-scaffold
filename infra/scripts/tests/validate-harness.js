#!/usr/bin/env node
/**
 * Validates the web test harness HTML file:
 *   1. File exists and is non-empty
 *   2. HTML tags are properly matched (no unclosed/mismatched tags)
 *   3. Inline <script> block has valid JavaScript syntax
 *
 * Usage: node validate-harness.js <path-to-html>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node validate-harness.js <path-to-html>');
  process.exit(1);
}

const resolved = path.resolve(filePath);
if (!fs.existsSync(resolved)) {
  console.error(`FAIL: File not found: ${resolved}`);
  process.exit(1);
}

const content = fs.readFileSync(resolved, 'utf8');
if (content.trim().length === 0) {
  console.error('FAIL: File is empty');
  process.exit(1);
}

// --- HTML tag matching ---
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
const stack = [];
const errors = [];
let match;

while ((match = tagPattern.exec(content)) !== null) {
  const full = match[0];
  const tag = match[1].toLowerCase();

  if (VOID_ELEMENTS.has(tag)) continue;
  if (full.endsWith('/>')) continue; // self-closing

  if (full.startsWith('</')) {
    if (stack.length === 0) {
      errors.push(`Unexpected closing tag </${tag}> at offset ${match.index}`);
    } else {
      const expected = stack.pop();
      if (expected !== tag) {
        errors.push(`Mismatched tags: expected </${expected}>, got </${tag}> at offset ${match.index}`);
      }
    }
  } else {
    stack.push(tag);
  }
}

for (const tag of stack) {
  errors.push(`Unclosed tag <${tag}>`);
}

if (errors.length > 0) {
  console.error('FAIL: HTML structure errors:');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}

console.log('PASS: HTML structure OK');

// --- JavaScript syntax ---
const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('FAIL: No <script> block found');
  process.exit(1);
}

try {
  new Function(scriptMatch[1]);
  console.log('PASS: JavaScript syntax OK');
} catch (e) {
  console.error('FAIL: JavaScript syntax error: ' + e.message);
  process.exit(1);
}

// --- Basic content checks ---
const requiredStrings = [
  'auth/login',
  'files/upload',
  'shares',
  'audit/events',
  'health/live',
  'search/files',
  'data-tab="system"',
  'data-tab="auth"',
  'data-tab="files"',
  'data-tab="shares"',
  'data-tab="search"',
  'data-tab="audit"',
];

const missing = requiredStrings.filter((s) => !content.includes(s));
if (missing.length > 0) {
  console.error('FAIL: Missing required content:');
  missing.forEach((s) => console.error('  ' + s));
  process.exit(1);
}

console.log('PASS: All required endpoint references and tabs present');
console.log(`Harness validated: ${resolved} (${content.length} bytes)`);
