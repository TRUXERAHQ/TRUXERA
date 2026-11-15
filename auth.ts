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
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        typeof user.email === "string"
      );
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const persistentUser = await persistAuthenticatedUser(
          user.email,
          user.name ?? user.email,
        );
        token.sub = persistentUser.id;
        token.email = persistentUser.email;
        token.name = persistentUser.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
