/** Validation failures detected before any network call. Mapped to messages by the ViewModels. */
export class AuthInputError extends Error {
  constructor(readonly reason: 'invalid_phone' | 'invalid_email' | 'invalid_code') {
    super(reason);
    this.name = 'AuthInputError';
  }
}
