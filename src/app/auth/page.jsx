import AuthClient from "../../components/client/auth-client";
export const metadata = {
  title: "Sign in — Assistant",
  description: "Sign in or create an account for your personal executive workspace.",
};
export default function AuthPage() {
  return <AuthClient />;
}
