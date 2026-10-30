import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,unlink} from 'node:fs/promises';
import {documentFixtures} from './document-fixtures.mjs';

/** Real encrypted sender-to-recipient delivery; only disposable owned accounts. */
export async function testDocumentDelivery(base,sender,recipient){
  assert.equal(new URL(base).hostname,'127.0.0.1');
  const fixtures=documentFixtures();
  if(process.env.ATTACHMENT_APK_FIXTURE)fixtures.push({name:'circlo-check.apk',mime:'application/vnd.android.package-archive',buffer:await readFile(process.env.ATTACHMENT_APK_FIXTURE)});
  for(const fixture of fixtures){
    // Android document providers commonly supply no useful MIME type.
    await sender.locator('input[type="file"]').first().setInputFiles({name:fixture.name,mimeType:'application/octet-stream',buffer:fixture.buffer});
    const accepted=sender.waitForResponse(response=>response.url().endsWith('/api/upload/message')&&response.request().method()==='POST');
    await sender.getByRole('button',{name:'Send attachments',exact:true}).click();
    const response=await accepted;assert.equal(response.status(),201,await response.text());
    const file=(await response.json()).message.attachments[0];assert.equal(file.mimeType,fixture.mime);assert.equal(file.encrypted,true);
    const stored=await recipient.request.get(base+'/api/media/'+file.id);assert.equal(stored.status(),200);
    assert(!Buffer.from(await stored.body()).equals(fixture.buffer),'Storage serves ciphertext, never the original document');
    const prepare=recipient.getByRole('button',{name:'Download '+fixture.name,exact:true});await prepare.waitFor();await prepare.click();
    const link=recipient.getByRole('link',{name:'Download '+fixture.name,exact:true});await link.waitFor();
    const saved=recipient.waitForEvent('download');await link.click();const download=await saved;
    assert.equal(download.suggestedFilename(),fixture.name);
    const path=await download.path();try{
      assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),createHash('sha256').update(fixture.buffer).digest('hex'),'Recipient downloads the exact original after on-device decryption');
    }finally{if(path)await unlink(path).catch(()=>{});}
  }
  console.log('PASS encrypted document delivery: generic picker MIME, PDF/Word/Excel/CSV'+(process.env.ATTACHMENT_APK_FIXTURE?'/real APK':'')+', ciphertext storage, recipient decryption, filename and byte-identical download');
}
