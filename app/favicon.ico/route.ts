// Some clients request the conventional URL even when SVG metadata is present.
export function GET(request: Request) {
  return Response.redirect(new URL('/favicon.svg', request.url), 308);
}
