import BriefingClient from "../components/client/briefing-client";
export const metadata = {
  title: "Assistant — Your day, under control",
  description: "A concise overview of your tasks, calendar, and inbox.",
};
export default function Home() {
  return <BriefingClient />;
}
