#!/usr/bin/env node
// In ra prompt đầy đủ (kèm ngữ cảnh) để skill /daily-digest:digest dùng trong phiên tương tác
import { buildPrompt } from './lib.mjs';
process.stdout.write(buildPrompt() + '\n');
