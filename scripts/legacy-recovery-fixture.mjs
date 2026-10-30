import assert from 'node:assert/strict';

/** Read only an owned loopback fixture identity to construct old-format archives. */
export async function legacyRecoveryFixture(page,userId) {
  assert(['127.0.0.1','localhost'].includes(new URL(page.url()).hostname));
  return page.evaluate(userId=>{
    const deviceId=localStorage.getItem('e2ee_device_id');
    const keys={};
    for(const key of Object.keys(localStorage))if(key.startsWith(`e2ee_sentkeys_${userId}_`))keys[key]=localStorage.getItem(key);
    return {version:1,userId,deviceId,keypair:localStorage.getItem(`e2ee_keypair_${userId}`),secret:localStorage.getItem(`e2ee_recovery_${userId}_${deviceId}`),keys};
  },userId);
}
