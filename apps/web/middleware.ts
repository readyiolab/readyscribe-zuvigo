import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const isExtension = origin.startsWith("chrome-extension://");
  const isLocal =
    origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");

  if (req.method === "OPTIONS" && (isExtension || isLocal)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-request-id",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next();
  if (isExtension || isLocal) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
