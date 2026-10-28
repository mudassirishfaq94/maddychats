/** Existing mfaTime records the verified enrollment epoch, not the login time.
 * resolveSessionAccess checks that epoch against current enrollment. Freshness
 * uses authTime, issued only after primary authentication and MFA complete.
 */
export function freshAdminSession(authTime: number, mfaTime: number, now = Date.now()): boolean {
  return Number.isFinite(mfaTime) && mfaTime > 0 && mfaTime <= now
    && Number.isFinite(authTime) && authTime > 0 && authTime <= now && now - authTime < 15 * 60_000;
}
