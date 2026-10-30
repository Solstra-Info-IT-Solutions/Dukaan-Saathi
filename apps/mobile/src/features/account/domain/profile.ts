/** The signed-in person (not the shop): name, contact used to sign in, app language. */
export interface MyProfile {
  displayName: string | null;
  phone: string | null;
  email: string | null;
  preferredLanguage: 'en' | 'hi';
}

export interface ProfilePatch {
  displayName?: string;
  preferredLanguage?: 'en' | 'hi';
}

export interface ProfileRepository {
  get(): Promise<MyProfile | null>;
  update(patch: ProfilePatch): Promise<void>;
}

export class ProfileInputError extends Error {
  constructor(readonly reason: 'invalid_name') {
    super(reason);
    this.name = 'ProfileInputError';
  }
}

export class GetMyProfile {
  constructor(private readonly profiles: ProfileRepository) {}
  execute(): Promise<MyProfile | null> {
    return this.profiles.get();
  }
}

/** Saves the name (2–80 characters, spaces tidied) and/or the language. */
export class UpdateMyProfile {
  constructor(private readonly profiles: ProfileRepository) {}
  async execute(patch: ProfilePatch): Promise<void> {
    const clean: ProfilePatch = { ...patch };
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80) throw new ProfileInputError('invalid_name');
      clean.displayName = name;
    }
    await this.profiles.update(clean);
  }
}
