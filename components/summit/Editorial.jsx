import Image from "next/image";
import geenoth from "@/assets/team-2026/Geenoth Viksura.png";
import hirushi from "@/assets/team-2026/Hirushi Gamage.png";
import lohansa from "@/assets/team-2026/Lohansa Munasinghe.png";
import linuk from "@/assets/team-2026/Linuk Perera.png";
import aidsl from "@/assets/AIDSL_FullLOGO_DARKNoBG.png";
import ieee from "@/assets/YPSL_Logo.png";
import {
  overview,
  purposePairs,
  audiences,
  formats,
  speakerRoles,
  passes,
  legacyLogos,
  socials,
} from "./data/migrated";
import styles from "./Summit.module.scss";

const Heading = ({ label, children }) => (
  <header className={styles.editorialHeading}>
    <p className={styles.label}>{label}</p>
    <h2 data-editorial-heading>{children}</h2>
  </header>
);
function Chapter({ id, children, className = "" }) {
  return (
    <section
      id={id}
      data-editorial
      className={`${styles.editorial} ${className}`}
    >
      {children}
    </section>
  );
}
export function Overview() {
  return (
    <Chapter id="summit-purpose">
      <div className={styles.prose}>
        {overview.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className={styles.editorialCaption}>
        GLOBAL NETWORK / KEY INNOVATORS / CROSS INDUSTRY
      </p>
      <h3 className={styles.subheading}>WHY AIDSL 2026?</h3>
      <div className={styles.purposePairs}>
        {purposePairs.map(([problem, solution], i) => (
          <article key={problem} data-purpose-pair>
            <span className={styles.editorialIndex}>0{i + 1}</span>
            <div>
              <p className={styles.label}>THE PROBLEM</p>
              <p>{problem}</p>
            </div>
            <div>
              <p className={styles.label}>OUR SOLUTION ↗</p>
              <p>{solution}</p>
            </div>
          </article>
        ))}
      </div>
    </Chapter>
  );
}
export function Audience() {
  return (
    <Chapter id="audience">
      <Heading label="ATTENDANCE PROFILE">
        WHO SHOULD
        <br />
        <em>BE IN THE ROOM.</em>
      </Heading>
      <ol className={styles.audienceList}>
        {audiences.map((name, i) => (
          <li key={name} data-editorial-row>
            <span>0{i + 1}</span>
            {name}
            <span aria-hidden="true">↗</span>
          </li>
        ))}
      </ol>
      <p className={styles.editorialCaption}>
        Not sure if it’s for you? It probably is — the event is built for
        everyone touching AI in Sri Lanka.
      </p>
    </Chapter>
  );
}
export function SpeakerDetails() {
  return (
    <Chapter id="speakers">
      <Heading label="BEYOND THE PROGRAMME">
        MORE WAYS TO <em>CONNECT.</em>
      </Heading>
      <aside className={styles.fellowship} data-editorial-row>
        <p className={styles.label}>{formats[4][2]}</p>
        <h3>{formats[4][0]}</h3>
        <p>{formats[4][1]}</p>
      </aside>
      <h3 className={styles.subheading}>MEET THE MINDS SHAPING AI</h3>
      <p className={styles.editorialCaption}>SPEAKER LINE-UP ANNOUNCED SOON.</p>
      <ol className={styles.speakerList}>
        {[...new Set(speakerRoles)].map((role) => (
          <li key={role} data-editorial-row>
            <h3>
              {role}
              {speakerRoles.filter((item) => item === role).length > 1
                ? " × 2"
                : ""}
            </h3>
          </li>
        ))}
      </ol>
    </Chapter>
  );
}
export function PassSelection({ enquire }) {
  return (
    <div
      id="register"
      className={styles.registrationPasses}
      data-registration-passes
    >
      <p className={styles.label}>PASS SELECTION</p>
      <h3 className={styles.passHeading}>SECURE YOUR SEAT.</h3>
      <p className={styles.editorialCaption}>
        Strictly limited capacity for maximum depth and high-caliber
        interaction.
      </p>
      <div className={styles.passList}>
        {passes.map((pass, i) => (
          <article key={pass.name} data-pass>
            <span className={styles.editorialIndex}>0{i + 1}</span>
            <div>
              <p className={styles.label}>{pass.label}</p>
              <h4>{pass.name}</h4>
              <p className={styles.passPrice}>Pricing to be announced soon</p>
              <ul>
                {pass.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
              <button onClick={() => enquire("registration")}>
                REGISTER <span>↗</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.editorialCaption}>
        SEATS ARE LIMITED · REGISTRATION DATES TO BE ANNOUNCED SOON
      </p>
    </div>
  );
}
export function LegacyPartners() {
  return (
    <Chapter id="previous-partners">
      <Heading label="LEGACY PARTNERS">
        OUR PREVIOUS
        <br />
        <em>PARTNERS.</em>
      </Heading>
      <p className={styles.editorialCaption}>
        These incredible organizations have supported our journey as partners in
        our previous events.
      </p>
      <div className={styles.legacyField}>
        {legacyLogos.map((src, i) => (
          <div key={src} data-legacy-logo>
            <Image
              src={src}
              width={480}
              height={192}
              alt={`Previous event partner logo ${i + 1}`}
            />
          </div>
        ))}
      </div>
    </Chapter>
  );
}
const leadership = [
  {
    name: "Geenoth Viksura",
    role: "CHAIRPERSON / AIDSL’26",
    photo: geenoth,
    phone: "074 353 8484",
    tel: "+94743538484",
    email: "gvwgeenoth365@gmail.com",
  },
  {
    name: "Hirushi Gamage",
    role: "SECRETARY / AIDSL’26",
    photo: hirushi,
    phone: "076 046 4199",
    tel: "+94760464199",
    email: "hirushigamagect@gmail.com",
  },
  {
    name: "Lohansa Munasinghe",
    role: "VICE-CHAIRPERSON / FINANCE & PARTNERSHIPS / AIDSL’26",
    photo: lohansa,
    phone: "071 200 7683",
    tel: "+94712007683",
    email: "lohansamunasinghe3@gmail.com",
  },
  {
    name: "Linuk Perera",
    role: "VICE-CHAIRPERSON / PROGRAM & DELIVERY / AIDSL’26",
    photo: linuk,
    phone: "077 374 4055",
    tel: "+94773744055",
    email: "linukperera402@gmail.com",
  },
];
export function Leadership() {
  return (
    <Chapter id="leadership">
      <Heading label="ORGANISATION & ECOSYSTEM">
        OUR
        <br />
        <em>LEADERSHIP.</em>
      </Heading>
      <p className={styles.editorialCaption}>
        Meet the individuals driving the AI-Driven Sri Lanka 2026 initiative.
      </p>
      <div className={styles.leadership}>
        {leadership.map((person, i) => (
          <article key={person.name} data-leader>
            <span className={styles.editorialIndex}>0{i + 1}</span>
            <Image
              src={person.photo}
              alt={person.name}
              sizes="(max-width: 650px) 35vw, 200px"
            />
            <div>
              <p className={styles.label}>{person.role}</p>
              <h3>{person.name}</h3>
              <a href={`tel:${person.tel}`}>{person.phone}</a>
              <a href={`mailto:${person.email}`}>{person.email}</a>
            </div>
          </article>
        ))}
      </div>
    </Chapter>
  );
}
export function SummitFooter({ go }) {
  return (
    <footer
      data-editorial
      id="summit-footer"
      className={`${styles.editorial} ${styles.fullFooter}`}
    >
      <div className={styles.footerColumns}>
        <div className={styles.organizerLogos}>
          {[
            [aidsl, "AI DRIVEN SRI LANKA", "ORGANIZING COMMITTEE"],
            [
              ieee,
              "IEEE YOUNG PROFESSIONALS SRI LANKA",
              "CO-ORGANIZING PARTNER",
            ],
          ].map(([src, name, role]) => (
            <div
              key={name}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            >
              <Image
                src={src}
                alt={name}
                draggable={false}
                sizes="(max-width: 650px) 75vw, 260px"
              />
              <p>{name}</p>
              <span>{role}</span>
            </div>
          ))}
        </div>
        <nav aria-label="Footer navigation">
          <p className={styles.label}>AIDSL 2026</p>
          {[
            "about",
            "programme",
            "experience",
            "register",
            "partners",
            "faq",
          ].map((id) => (
            <a key={id} href={`#${id}`} onClick={(e) => go(e, id)}>
              {id.toUpperCase()}
            </a>
          ))}
          <a href="/home">VISIT AIDSL ↗</a>
        </nav>
        <div>
          <p className={styles.label}>CONNECT & COMMUNITY</p>
          <p>
            Follow AI-Driven Sri Lanka for official speaker releases, ticket
            alerts, and national hackathon announcements.
          </p>
          <div className={styles.socialLinks}>
            {socials.map(([name, href]) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {name} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.copyright}>
        <p>
          © 2026 AI DRIVEN SRI LANKA. All rights reserved. Co-organized with
          IEEE Young Professionals Sri Lanka.
        </p>
        <a href="#hero" onClick={(e) => go(e, "hero")}>
          BACK TO TOP ↑
        </a>
      </div>
    </footer>
  );
}
