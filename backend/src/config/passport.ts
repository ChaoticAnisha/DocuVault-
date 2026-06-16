import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import crypto from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: '/api/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email returned from Google'), undefined);
        }

        // Try to find by googleId first, then fall back to email so existing
        // email/password accounts can link their Google identity on first OAuth login.
        let user = await prisma.user.findFirst({
          where: { OR: [{ googleId: profile.id }, { email }] },
        });

        if (user) {
          // Link the Google ID if this is a pre-existing email/password account.
          if (!user.googleId) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId: profile.id, avatarUrl: profile.photos?.[0]?.value },
            });
          }
        } else {
          // Create a new user. Username derived from display name + random suffix.
          const base = (profile.displayName ?? email.split('@')[0])
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 20);
          const username = `${base}_${crypto.randomBytes(4).toString('hex')}`;

          user = await prisma.user.create({
            data: {
              email,
              username,
              googleId: profile.id,
              avatarUrl: profile.photos?.[0]?.value ?? null,
              isEmailVerified: true,
            },
          });
        }

        return done(null, user);
      } catch (err) {
        logger.error('Google OAuth strategy error', err);
        return done(err as Error, undefined);
      }
    }
  )
);

// We use JWTs issued as cookies; no persistent session serialization needed.
passport.serializeUser((user: Express.User, done) => done(null, (user as { id: string }).id));
passport.deserializeUser((id: string, done) => done(null, { id } as Express.User));

export default passport;
