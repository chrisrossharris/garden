import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtected = createRouteMatcher(['/app(.*)']);

export const onRequest = clerkMiddleware((auth, context, next) => {
  if (isProtected(context.request)) {
    const authObject = auth();
    if (!authObject.userId) {
      return authObject.redirectToSignIn({ returnBackUrl: context.request.url });
    }
  }

  return next();
});
