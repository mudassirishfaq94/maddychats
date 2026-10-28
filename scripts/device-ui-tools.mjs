/** Open the one settings destination used by device/security workflows. */
export async function openDeviceTools(page) {
 if(new URL(page.url()).pathname==='/app/profile')await page.goto(new URL('/app/settings#privacy',page.url()).href);
 const tools=page.locator('summary').filter({hasText:/^Linked phones and account security$/});
 if(await tools.count() && await tools.locator('..').getAttribute('open')===null)await tools.click();
 await page.getByLabel("This device safety number").waitFor({state:"attached",timeout:30000});
 const more=page.locator("summary").filter({hasText:/^More ways to save$/});if(await more.count() && await more.locator("..").getAttribute("open")===null)await more.click();
 for(const text of ["Device details","Troubleshooting"]){const summary=page.locator("#encryption-devices summary").filter({hasText:new RegExp("^"+text+"$")});if(await summary.count() && await summary.locator("..").getAttribute("open")===null)await summary.click();}
}
