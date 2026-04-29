import { redirect } from "next/navigation";

export default function Page() {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN;

  redirect(`https://${domain}`);
}
