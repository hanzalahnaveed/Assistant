import EmailClient from "@/components/client/email-client";

export const metadata = {
  title: "Email inbox — Assistant",
  description: "Process incoming email, review replies, and track extracted tasks.",
};

export default function EmailPage() {
  return <EmailClient />;
}
