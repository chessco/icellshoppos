/**
 * iReader Multiplatform Architecture v2.0 - Auth Token Port
 *
 * Platform-independent abstraction representing a credential or session token.
 * Accommodates cookies, bearer tokens, or refresh tokens without coupling
 * the API Client or Domain logic to a specific HTTP header format.
 */

export interface IAuthToken {
  /** The raw token value (e.g. JWT string or cookie value) */
  readonly rawValue: string;

  /** Name of the header where this token must be sent (e.g. "cookie" or "authorization") */
  readonly headerName: string;

  /** Formatted header value (e.g. "icellshop_session=abc" or "Bearer abc") */
  readonly headerValue: string;

  /** Optional expiration timestamp */
  readonly expiresAt?: Date;
}

export class CookieAuthToken implements IAuthToken {
  public readonly headerName = "cookie";
  public readonly cookieName: string;
  public readonly tokenValue: string;
  public readonly expiresAt?: Date;

  constructor(
    cookieName: string,
    tokenValue: string,
    expiresAt?: Date
  ) {
    this.cookieName = cookieName;
    this.tokenValue = tokenValue;
    this.expiresAt = expiresAt;
  }

  get rawValue(): string {
    return this.tokenValue;
  }

  get headerValue(): string {
    return `${this.cookieName}=${this.tokenValue}`;
  }

  static fromCookieHeader(cookieHeader: string | null, cookieName = "icellshop_session"): CookieAuthToken | null {
    if (!cookieHeader) return null;
    const regex = new RegExp(`${cookieName}=([^;]+)`, "i");
    const match = cookieHeader.match(regex);
    if (!match || !match[1]) return null;
    return new CookieAuthToken(cookieName, match[1]);
  }
}

export class BearerAuthToken implements IAuthToken {
  public readonly headerName = "authorization";
  public readonly tokenValue: string;
  public readonly expiresAt?: Date;

  constructor(
    tokenValue: string,
    expiresAt?: Date
  ) {
    this.tokenValue = tokenValue;
    this.expiresAt = expiresAt;
  }

  get rawValue(): string {
    return this.tokenValue;
  }

  get headerValue(): string {
    return `Bearer ${this.tokenValue}`;
  }
}
