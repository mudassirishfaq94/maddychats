/** Explicitly open the advanced controls only when exercising security workflows. */
export async function openDeviceTools(page) {
  await page.getByLabel("This device safety number").waitFor({ state: "attached", timeout: 30000 });
  for (const text of ["Device details", "Troubleshooting", "Back up or restore chats"]) {
    const summary = page.locator("#encryption-devices summary").filter({ hasText: new RegExp("^" + text + "$") });
    if (await summary.locator("..").getAttribute("open") === null) await summary.click();
  }
}
