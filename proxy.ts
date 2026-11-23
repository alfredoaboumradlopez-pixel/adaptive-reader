import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password gate. Set APP_PASSWORD in Railway to turn it on;
 * the browser asks once (any username) and remembers it.
 * Icons and manifest stay public so "Add to Home Screen" works.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TAR", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)"],
};
