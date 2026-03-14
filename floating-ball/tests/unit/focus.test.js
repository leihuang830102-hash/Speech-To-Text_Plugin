// floating-ball/tests/focus.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Test: BrowserWindow should have focusable: false
 *
 * This test verifies that the floating ball window is configured
 * to never take focus, preventing Alt+Tab flash on Windows.
 */

describe('Floating Ball Focus Configuration', () => {
  let mainContent;

  beforeAll(() => {
    const mainPath = path.join(__dirname, '..', '..', 'main.js');
    mainContent = fs.readFileSync(mainPath, 'utf-8');
  });

  it('should have focusable set to false in window options', () => {
    // Check that focusable: false is present in BrowserWindow options
    expect(mainContent).toMatch(/focusable:\s*false/);
  });

  it('should not contain Alt+Tab keyboard simulation', () => {
    // Alt+Tab should be removed to prevent Windows task switcher flash
    // Regex matches: Key.Tab (keyboard code) or LeftAlt+Tab/Tab+LeftAlt (key combinations)
    expect(mainContent).not.toMatch(/Key\.Tab/);
    expect(mainContent).not.toMatch(/LeftAlt.*Tab|Tab.*LeftAlt/);
  });
});
