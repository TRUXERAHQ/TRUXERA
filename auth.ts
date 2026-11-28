import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { persistAuthenticatedUser } from "@/src/prisma/auth-data";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    signIn({ account, profile, user }) {
      // TEMP diag: remove after staging OAuth debug
      console.log(
        "[auth:signin]",
        JSON.stringify({
          provider: account?.provider,
          emailVerified: profile?.email_verified,
          emailType: typeof user?.email,
        }),
      );
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        typeof user.email === "string"
      );
    },
    async jwt({ token, user }) {
      if (user?.email) {
        try {
          const persistentUser = await persistAuthenticatedUser(
            user.email,
            user.name ?? user.email,
          );
          token.sub = persistentUser.id;
          token.email = persistentUser.email;
          token.name = persistentUser.name;
        } catch (e) {
          // TEMP diag: remove after staging OAuth debug
          console.error("[auth:jwt:persist]", String(e).slice(0, 500));
          throw e;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // TEMP diag: remove after staging OAuth debug
      console.log(
        "[auth:session]",
        JSON.stringify({ hasSub: Boolean(token.sub), hasUser: Boolean(session.user) }),
      );
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
