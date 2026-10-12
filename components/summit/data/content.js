import { rootFaq, socials } from "./migrated";
export const event = {
  name: "AIDSL 2026 SUMMIT",
  date: "TO BE ANNOUNCED SOON",
  venue: "TO BE ANNOUNCED SOON",
  registrationUrl: "/register",
  partnershipEmail: "aidrivensrilanka@gmail.com",
  contactEmail: "aidrivensrilanka@gmail.com",
  socials,
};
export const stakeholders = [
  "AI EXPERTS",
  "INNOVATORS",
  "STARTUPS",
  "ACADEMIA",
  "INDUSTRY",
  "POLICYMAKERS",
];
export const experiences = [
  {
    title: "LEARN",
    lines: ["KEYNOTES", "PANEL DISCUSSIONS", "AI FORUM"],
    symbol: "01",
  },
  {
    title: "CONNECT",
    lines: ["ACADEMIA", "INDUSTRY", "STARTUPS", "POLICYMAKERS"],
    symbol: "02",
  },
  {
    title: "INNOVATE",
    lines: ["INNOVATION SHOWCASE", "LOCAL TALENT", "NEW IDEAS"],
    symbol: "03",
  },
  {
    title: "TRANSFORM",
    lines: ["COLLABORATE", "BUILD", "SHAPE THE FUTURE"],
    symbol: "04",
  },
];
export const partners = [
  "STRATEGIC PARTNERS",
  "GOLD PARTNERS",
  "TECHNOLOGY PARTNERS",
  "MEDIA PARTNERS",
  "COMMUNITY PARTNERS",
].map((category, i) => ({
  category,
  partners: [1, 2].map((n) => ({
    name: `PARTNER ${String(i * 2 + n).padStart(2, "0")}`,
    logo: null,
    url: null,
  })),
}));
export const faq = [
  ...rootFaq,
  [
    "WHAT CAN ATTENDEES EXPECT?",
    "Keynotes, panel discussions, an AI forum, an innovation showcase and opportunities for networking and collaboration.",
  ],
  [
    "CAN ORGANIZATIONS PARTNER WITH THE SUMMIT?",
    "Yes. Partnership opportunities include strategic, gold, technology, media and community partnerships.",
  ],
  ["HOW CAN I REGISTER?", "Create a delegate account through the registration portal. Pass pricing and availability will be announced soon."],
];
