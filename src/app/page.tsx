import BriefingClient from "./briefing/briefing-client";

export const metadata = {
  title: "Assistant — Your day, under control",
  description: "Your live daily briefing, task priorities, calendar, and inbox follow-up recommendations."
};

export default function Home() {
  return <BriefingClient />;
}
