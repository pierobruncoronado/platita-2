// Fingerprint spike (spec decision 2): WebAuthn platform authenticator, user verification required.
// Local-only: there is no server, so the assertion is not signature-checked — a successful
// verification gesture just unlocks the interface, exactly like the PIN does. PIN stays the fallback.

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

function toB64Url(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

export async function biometricSupported(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// Returns the credential id (base64url). Throws the browser's DOMException on cancel/failure.
export async function enrollBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Platita' },
      user: { id: randomBytes(16), name: 'platita', displayName: 'Platita' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('no credential returned')
  return toB64Url(cred.rawId)
}

// true only if the user passed the platform verification (fingerprint / screen lock).
export async function verifyBiometric(id: string): Promise<boolean> {
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromB64Url(id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return result !== null
  } catch (err) {
    console.error(JSON.stringify({ event: 'biometric_verify_failed', reason: err instanceof Error ? err.name : 'unknown' }))
    return false
  }
}
