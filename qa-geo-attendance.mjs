#!/usr/bin/env node
/**
 * QA Verification Script for Multi-Campus CRUD Operations (ERP-68)
 * Automates Steps 3-10 from the task brief.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Evidence directory
const EVIDENCE_DIR = join(__dirname, 'docs', 'superpowers', 'implementation-reports', 'evidence', 'erp68', 'ac1-ac2');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Step 3: Logging in as school admin...");
    // Navigate to login page
    await page.goto('http://school1.lvh.me:3000/login');
    await page.waitForLoadState('networkidle');

    // Enter phone number
    const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone" i]').first();
    await phoneInput.fill('9000000002');

    // Click submit/continue button
    let submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    // Enter OTP
    const otpInput = page.locator('input[type="text"], input[name="otp"], input[placeholder*="otp" i]').first();
    await otpInput.fill('123456');

    // Submit OTP
    submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    console.log("Step 3: Navigating to geo-attendance settings...");
    // Navigate to geofence setup page
    await page.goto('http://school1.lvh.me:3000/admin/settings/geo-attendance');
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 01: Initial page
    console.log("Taking screenshot 01-initial-page.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '01-initial-page.png'), fullPage: true });

    // Step 4: Create Campus A
    console.log("\nStep 4: Creating Campus A...");
    const addCampusBtn = page.locator('button').filter({ hasText: /add campus/i }).first();
    await addCampusBtn.click();
    await sleep(1000);

    // Fill Campus A details - use specific class-based selectors for the form section
    // The form is in the bottom section with border-t class
    const formSection = page.locator('.border-t').filter({ hasText: 'Campus name' });

    // Get inputs within the form section
    await formSection.locator('input').first().fill('QA Campus A');  // Campus name

    const formNumbers = await formSection.locator('input[type="number"]').all();
    await formNumbers[0].fill('18.4650');  // Latitude
    await formNumbers[1].fill('73.8700');  // Longitude
    await formNumbers[2].fill('150');       // Radius number input

    // Save geofence
    let saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 02: Campus A created
    console.log("Taking screenshot 02-campus-a-created.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '02-campus-a-created.png'), fullPage: true });

    // Step 5: Create Campus B
    console.log("\nStep 5: Creating Campus B...");
    const addAnotherBtn = page.locator('button').filter({ hasText: /add/i }).first();
    await addAnotherBtn.click();
    await sleep(1000);

    // Fill Campus B details
    const formSectionB = page.locator('.border-t').filter({ hasText: 'Campus name' });
    await formSectionB.locator('input').first().fill('QA Campus B');  // Campus name

    const formNumbersB = await formSectionB.locator('input[type="number"]').all();
    await formNumbersB[0].fill('18.4500');  // Latitude
    await formNumbersB[1].fill('73.8600');  // Longitude
    await formNumbersB[2].fill('250');      // Radius

    // Save geofence
    saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 03: Campus B created
    console.log("Taking screenshot 03-campus-b-created.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '03-campus-b-created.png'), fullPage: true });

    // Step 6: Switch to Campus A
    console.log("\nStep 6: Switching to Campus A...");
    const campusA = page.locator('text="QA Campus A"').first();
    await campusA.click();
    await sleep(1000);

    // Screenshot 04: Switched to A
    console.log("Taking screenshot 04-switched-to-a.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '04-switched-to-a.png'), fullPage: true });

    // Switch to Campus B
    console.log("Switching to Campus B...");
    const campusB = page.locator('text="QA Campus B"').first();
    await campusB.click();
    await sleep(1000);

    // Screenshot 05: Switched to B
    console.log("Taking screenshot 05-switched-to-b.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '05-switched-to-b.png'), fullPage: true });

    // Step 7: Update Campus B
    console.log("\nStep 7: Updating Campus B...");
    const formSectionUpdate = page.locator('.border-t').filter({ hasText: 'Campus name' });
    await formSectionUpdate.locator('input').first().fill('QA Campus B (Updated)');  // Campus name

    const formNumbersUpdate = await formSectionUpdate.locator('input[type="number"]').all();
    await formNumbersUpdate[2].fill('300');  // Radius number input

    // Save geofence
    saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 06: Campus B updated
    console.log("Taking screenshot 06-campus-b-updated.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '06-campus-b-updated.png'), fullPage: true });

    // Step 8: Delete Campus A
    console.log("\nStep 8: Deleting Campus A...");
    const campusAAgain = page.locator('text="QA Campus A"').first();
    await campusAAgain.click();
    await sleep(1000);

    // Setup dialog handler BEFORE clicking delete
    page.on('dialog', dialog => dialog.accept());

    // Click trash/delete icon - button with text-destructive class
    const trashBtn = page.locator('button.text-destructive').first();
    await trashBtn.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 08: Campus A deleted
    console.log("Taking screenshot 08-campus-a-deleted.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '08-campus-a-deleted.png'), fullPage: true });

    // Step 9: Reload page
    console.log("\nStep 9: Reloading page to verify persistence...");
    await page.reload();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    // Screenshot 10: After reload
    console.log("Taking screenshot 10-after-reload.png...");
    await page.screenshot({ path: join(EVIDENCE_DIR, '10-after-reload.png'), fullPage: true });

    // Step 10: Cleanup - Delete Campus B
    console.log("\nStep 10: Cleanup - Deleting Campus B...");
    const campusBUpdated = page.locator('text="QA Campus B (Updated)"').first();
    await campusBUpdated.click();
    await sleep(1000);

    // Click trash/delete icon
    const trashBtn2 = page.locator('button.text-destructive').first();
    await trashBtn2.click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    console.log("\n✓ All steps completed successfully!");

  } catch (error) {
    console.error(`\n✗ Error during automation: ${error.message}`);
    // Take error screenshot
    await page.screenshot({ path: join(EVIDENCE_DIR, 'error-screenshot.png'), fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
