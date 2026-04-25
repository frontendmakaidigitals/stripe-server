import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

interface ShopifyTokenResponse {
  access_token?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");

  if (!code || !shop) {
    return NextResponse.json(
      { error: "Missing code or shop" },
      { status: 400 },
    );
  }

  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  // Exchange code for access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData: ShopifyTokenResponse = await tokenRes.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Failed to get token", details: tokenData },
      { status: 400 },
    );
  }

  // Show the token on screen
  return new NextResponse(
    `
        <html>
            <body style="font-family:sans-serif;padding:40px;">
                <h2>✅ Access Token Retrieved!</h2>
                <p><strong>Shop:</strong> ${shop}</p>
                <p><strong>Access Token:</strong></p>
                <textarea rows="4" cols="80" style="font-size:14px">${accessToken}</textarea>
                <p style="color:red">⚠️ Copy this token now and store it safely. Do not share it.</p>
            </body>
        </html>
    `,
    {
      headers: { "Content-Type": "text/html" },
    },
  );
}
