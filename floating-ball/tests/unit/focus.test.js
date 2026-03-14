// floating-ball/tests/focus.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Test: BrowserWindow should have focusable: false
 *
 * This test verifies that the floating ball window is configured
 * to never take focus, preventing Alt+Tab flash on Windows.
 */

describe('Floating Ball Focus Configuration', () => {
  it('should have focusable set to false in window options', () => {
    // Read main.js and check for focusable: false
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.join(__dirname, '..', '..', 'main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    // Check that focusable: false is present in BrowserWindow options
    expect(mainContent).toMatch(/focusable:\s*false/);
  });

  it('should not contain Alt+Tab keyboard simulation', () => {
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.join(__dirname, '..', '..', 'main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    // Alt+Tab should be removed to prevent flash
    expect(mainContent).not.toMatch(/Key\.Tab/);
    expect(mainContent).not.toMatch(/LeftAlt.*Tab|Tab.*LeftAlt/);
  });
});
