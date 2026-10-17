import BriefingClient from "./briefing-client";

export const metadata = {
  title: "Daily briefing — Assistant",
  description: "Your live workday briefing, priorities, upcoming meetings, and inbox follow-up recommendations."
};

export default function BriefingPage() {
  return <BriefingClient />;
}
