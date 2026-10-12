"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { event, experiences, partners, faq } from "./data/content";
import { setupMotion } from "./motion";
import Starfield from "./Starfield";
import {
  Overview,
  Audience,
  SpeakerDetails,
  PassSelection,
  LegacyPartners,
  Leadership,
  SummitFooter,
} from "./Editorial";
import {
  agenda,
  partnershipBenefits,
  pillars,
  statistics,
} from "./data/migrated";
import styles from "./Summit.module.scss";
const Scene = dynamic(() => import("./webgl/Scene"), { ssr: false });
const Label = ({ children }) => <p className={styles.label}>{children}</p>;
function EventDetails() {
  return (
    <div className={styles.details}>
      <div>
        <span>DATE</span>
        <p>{event.date}</p>
      </div>
      <div>
        <span>VENUE</span>
        <p>
          COLOMBO
          <br />
          <small>TO BE ANNOUNCED SOON</small>
        </p>
      </div>
    </div>
  );
}
export default function Summit() {
  const root = useRef(null),
    dialog = useRef(null),
    controller = useRef(null);
  const motion = useRef({
    scene: "hero",
    progress: 0,
    heroProgress: 0,
    registrationOffset: 0,
    intro: 0,
    reduced: false,
    pointer: { x: 0.5, y: 0.5, active: false },
  });
  const [ready, setReady] = useState(false),
    [reduced, setReduced] = useState(true),
    [openFaq, setOpenFaq] = useState(null),
    [intent, setIntent] = useState("registration"),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      motion.current.reduced = media.matches;
      setReduced(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const result = setupMotion(root.current, motion.current, reduced);
    controller.current = result;
    return () => result.destroy();
  }, [reduced]);
  useEffect(() => {
    if (ready && !reduced) controller.current?.startIntro();
  }, [ready, reduced]);
  const go = (e, id) => {
    e.preventDefault();
    setMenu(false);
    controller.current?.go(id);
  };
  const enquire = (type) => {
    if (type === "registration" && event.registrationUrl) {
      window.location.assign(event.registrationUrl);
      return;
    }
    if (type === "partnership" && event.partnershipEmail) {
      window.location.href = `mailto:${event.partnershipEmail}`;
      return;
    }
    setIntent(type);
    dialog.current.showModal();
  };
  useEffect(() => {
    const pointer = (e) => {
      motion.current.pointer.x = e.clientX / innerWidth;
      motion.current.pointer.y = e.clientY / innerHeight;
      motion.current.pointer.active = true;
    };
    const leave = () => {
      motion.current.pointer.active = false;
    };
    window.addEventListener("pointermove", pointer);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", pointer);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div
      ref={root}
      className={`${styles.summit} ${ready ? styles.webglReady : ""}`}
      data-reduced={reduced}
    >
      <a className={styles.skip} href="#about">
        Skip introduction
      </a>
      <Starfield root={root} motion={motion} reduced={reduced} />
      <div className={styles.canvas} aria-hidden="true">
        <Scene
          motion={motion}
          reduced={reduced}
          onReady={() => setReady(true)}
          onFailure={() => {
            setReady(false);
            setReduced(true);
          }}
        />
      </div>
      <div className={styles.cursor} data-cursor aria-hidden="true" />
      <header className={styles.nav} data-nav>
        <a
          href="#hero"
          onClick={(e) => go(e, "hero")}
          className={styles.brand}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          <img
            src="/graphics/aidsl-nav-logo.png"
            alt="AIDSL"
            draggable="false"
            onContextMenu={(event) => event.preventDefault()}
          />
          <span>2026 SUMMIT</span>
        </a>
        <button
          className={styles.menuToggle}
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-controls="summit-menu"
        >
          {menu ? "CLOSE" : "MENU"}
        </button>
        <nav
          id="summit-menu"
          className={menu ? styles.menuOpen : ""}
          aria-label="Summit navigation"
        >
          {["about", "experience", "programme", "partners", "faq"].map((id) => (
            <a key={id} href={`#${id}`} onClick={(e) => go(e, id)}>
              {id}
            </a>
          ))}
          <a
            className={styles.navRegister}
            href="#register"
            onClick={(e) => go(e, "register")}
          >
            REGISTER <span>↗</span>
          </a>
        </nav>
      </header>
      <main>
        <section
          id="hero"
          data-scene="hero"
          className={`${styles.scene} ${styles.hero}`}
        >
          <div className={styles.heroTop} data-hero-ui>
            <Label>SRI LANKA’S PREMIER AI GATHERING</Label>
            <span>
              COLOMBO, LK
              <br />
              2026 — ONE SHARED FUTURE
            </span>
          </div>
          <h1
            className={styles.heroTitle}
            aria-label="THE AI FUTURE THINKS HERE."
          >
            <span className={styles.mask}>
              <span data-title-one>THE AI FUTURE</span>
            </span>
            <span className={styles.mask}>
              <span data-title-two>THINKS HERE.</span>
            </span>
          </h1>
          <div className={styles.logoFallback} aria-hidden="true">
            AIDSL<span>AI DRIVEN SRI LANKA</span>
          </div>
          <div className={styles.heroBottom} data-hero-ui>
            <p>
              One high-impact day bringing together global and local AI experts,
              innovators, startups and policymakers to shape Sri Lanka’s AI
              future.
            </p>
            <EventDetails />
            <div className={styles.actions}>
              <button onClick={() => enquire("registration")}>
                REGISTER INTEREST <span>↗</span>
              </button>
              <a href="#programme" onClick={(e) => go(e, "programme")}>
                EXPLORE PROGRAMME <span>↗</span>
              </a>
            </div>
          </div>
          <dl
            id="quick-facts"
            className={styles.heroStats}
            data-hero-stats
            aria-label="Summit at a glance"
          >
            {statistics.map(([value, label]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.sceneFooter} data-scroll>
            <span>SCROLL TO EXPLORE</span>
            <span>↓</span>
            <span>01 / 10</span>
          </div>
        </section>
        <section
          data-scene="manifesto"
          className={`${styles.scene} ${styles.manifesto}`}
          aria-label="Summit manifesto"
        >
          <div className={styles.manifestoTrack} data-manifesto>
            {[
              "A ONE-DAY\nGATHERING FOR",
              "AI EXPERTS",
              "INNOVATORS",
              "STARTUPS",
              "POLICYMAKERS",
              "TO SHAPE",
              "SRI LANKA’S\nAI FUTURE.",
            ].map((word, i) => (
              <p key={word}>
                <small>0{i + 1}</small>
                {word}
              </p>
            ))}
          </div>
          <span className={styles.bottomLabel}>
            MANY PERSPECTIVES. ONE SHARED DIRECTION.
          </span>
        </section>
        <Overview />
        <section
          id="about"
          data-scene="about"
          className={`${styles.scene} ${styles.about}`}
        >
          <div data-about-intro>
            <Label>01 — ABOUT THE SUMMIT</Label>
            <h2>
              A FLAGSHIP
              <br />
              <em>NATIONAL</em>
              <br />
              EVENT.
            </h2>
            <p className={styles.aboutFormats}>
              KEYNOTES · PANEL DISCUSSIONS · AI FORUM
              <br />
              INNOVATION SHOWCASE · NETWORKING
            </p>
          </div>
          <div className={styles.purpose} data-purpose>
            <Label>THE PURPOSE</Label>
            <h2 data-bring>BRING</h2>
            <div className={styles.convergence}>
              {["ACADEMIA", "INDUSTRY", "STARTUPS", "POLICYMAKERS"].map((w) => (
                <span data-converge key={w}>
                  {w}
                </span>
              ))}
            </div>
            <h2 data-one>
              ONE
              <br />
              <em>ECOSYSTEM.</em>
            </h2>
            <p>
              Give local AI talent greater industry exposure.
              <br />
              Build access to global networks and collaboration.
            </p>
          </div>
        </section>
        <section
          id="ecosystem"
          data-scene="ecosystem"
          className={`${styles.scene} ${styles.ecosystem}`}
        >
          <div data-ecosystem-title>
            <Label>02 — THE ECOSYSTEM</Label>
            <h2>
              THE FUTURE
              <br />
              ISN’T BUILT
              <br />
              <em>ALONE.</em>
            </h2>
          </div>
          <Image
            className={styles.humanoidFallback}
            src="/graphics/aidsl-ecosystem.webp"
            width={700}
            height={700}
            alt="AIDSL humanoid encircled by an orange orbital ring"
          />
          <div data-ecosystem-final className={styles.ecosystemFinal}>
            <Label>PEOPLE. POSSIBILITIES. PROGRESS.</Label>
            <h2>
              LOCAL TALENT.
              <br />
              <em>GLOBAL CONNECTIONS.</em>
            </h2>
          </div>
          <p className={styles.bottomLabel}>
            AI EXPERTS / INNOVATORS / STARTUPS / ACADEMIA / INDUSTRY /
            POLICYMAKERS
          </p>
        </section>
        <Audience />
        <section
          id="experience"
          data-scene="experience"
          className={`${styles.scene} ${styles.experience}`}
        >
          <div data-experience-title>
            <Label>03 — FOUR WAYS TO MOVE AI FORWARD</Label>
            <h2>
              THE SUMMIT
              <br />
              <em>EXPERIENCE.</em>
            </h2>
          </div>
          <div className={styles.deck}>
            {experiences.map((card, i) => (
              <article className={styles.card} data-card key={card.title}>
                <div className={styles.cardTop}>
                  <span>AIDSL / 2026</span>
                  <span>{card.symbol}</span>
                </div>
                <div className={styles.cardGlyph} aria-hidden="true">
                  {["↗", "↔", "※", "↗"][i]}
                </div>
                <h3>{card.title}</h3>
                <p className={styles.cardDescription}>{pillars[i][1]}</p>
                <span className={styles.cardFoot}>
                  THE AI FUTURE THINKS HERE.
                </span>
              </article>
            ))}
          </div>
          <div data-deck-wipe className={styles.deckWipe} />
        </section>
        <section
          id="programme"
          data-scene="programme"
          className={`${styles.scene} ${styles.programme}`}
        >
          <div className={styles.programmeTop}>
            <Label>04 — PROGRAMME</Label>
            <p>
              DATE TO BE ANNOUNCED SOON.
              <br />
              THE DAY, IN DETAIL.
            </p>
          </div>
          <h2 className={styles.srOnly}>Programme</h2>
          <ol className={styles.programmeRows}>
            {agenda.map((item, i) => (
              <li
                className={styles.programmeRow}
                data-programme-row
                key={item.time}
              >
                <span className={styles.programmeTime}>{item.time}</span>
                <div className={styles.programmeSession}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className={styles.rowArrow}>↗</span>
                <div className={styles.ribbon} data-ribbon aria-hidden="true">
                  {Array.from({ length: 5 }, (_, j) => (
                    <div
                      key={j}
                      style={{
                        "--tilt": `${(j % 2 ? 1 : -1) * (4 + j)}deg`,
                        "--offset": `${((j % 3) - 1) * 34}px`,
                      }}
                    >
                      <Image
                        src={`/images/programme/study-${(i + j) % 5}.webp`}
                        width={300}
                        height={210}
                        priority={i === 0 && j < 2}
                        alt=""
                      />
                      <span>
                        {
                          [
                            "EXCHANGE",
                            "DISCOVER",
                            "EXPLORE",
                            "CONNECT",
                            "BUILD",
                          ][j]
                        }{" "}
                        / {String(j + 1).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <SpeakerDetails />
        <section
          data-scene="invitation"
          className={`${styles.scene} ${styles.invitation}`}
        >
          <Label>05 — YOUR NEXT CONVERSATION STARTS HERE</Label>
          <h2 data-invitation>
            {[
              "BE IN THE ROOM",
              "WHERE",
              "SRI LANKA’S",
              "AI FUTURE",
              "TAKES SHAPE.",
            ].map((w) => (
              <span key={w}>{w}</span>
            ))}
          </h2>
        </section>
        <section
          id="registration"
          data-scene="registration"
          className={`${styles.scene} ${styles.registration}`}
        >
          <div className={styles.registrationPanel} data-registration-panel>
            <div
              className={styles.registrationContent}
              data-registration-content
            >
              <div className={styles.registrationIntro}>
                <Label>AIDSL 2026 SUMMIT</Label>
                <h2>
                  THE AI FUTURE
                  <br />
                  THINKS HERE.
                </h2>
                <EventDetails />
                <div className={styles.actions}>
                  <a
                    className={styles.choosePass}
                    href="#register"
                    onClick={(e) => go(e, "register")}
                  >
                    CHOOSE YOUR PASS <span>↓</span>
                  </a>
                  <a href="#programme" onClick={(e) => go(e, "programme")}>
                    VIEW PROGRAMME <span>↗</span>
                  </a>
                </div>
              </div>
              <PassSelection enquire={enquire} />
              <p className={styles.registrationNote}>
                A place for your ideas. A part in what comes next.
              </p>
            </div>
          </div>
          <div data-circle className={styles.circle} />
        </section>
        <section
          id="partners"
          data-scene="partners"
          className={`${styles.scene} ${styles.partners}`}
        >
          <Label>06 — PARTNERS</Label>
          <h2 data-partner-heading>
            BUILDING THE
            <br />
            <em>FUTURE TOGETHER.</em>
          </h2>
          <div className={styles.partnerField} data-partner-field>
            {partners.map((group, i) => (
              <div
                className={styles.partnerGroup}
                data-partner-group
                key={group.category}
                style={{ "--index": i }}
              >
                <p>{group.category}</p>
                {group.partners.map((p) => (
                  <div key={p.name}>
                    {p.logo ? (
                      <Image
                        src={p.logo}
                        width={180}
                        height={80}
                        alt={p.name}
                      />
                    ) : (
                      <>
                        <span>＋</span>
                        {p.name}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.partnerFinal} data-partner-final>
            <h2>
              BECOME
              <br />
              <em>A PARTNER.</em>
            </h2>
            <p>
              Elevate your brand at Sri Lanka’s benchmark machine intelligence
              forum.
            </p>
            <p className={styles.partnershipBenefits}>
              {partnershipBenefits.join(" · ")}
            </p>
            <button onClick={() => enquire("partnership")}>
              BECOME A PARTNER <span>↗</span>
            </button>
            <a
              className={styles.deckRequest}
              href="mailto:aidrivensrilanka@gmail.com?subject=AIDSL%202026%20Sponsorship%20Deck"
            >
              REQUEST SPONSORSHIP DECK ↗
            </a>
          </div>
        </section>
        <LegacyPartners />
        <Leadership />
        <section id="faq" className={styles.faq}>
          <Label>07 — A FEW THINGS TO KNOW</Label>
          <h2>QUESTIONS?</h2>
          <div>
            {faq.map(([question, answer], i) => (
              <div
                className={styles.faqItem}
                key={question}
                data-open={openFaq === i}
              >
                <h3>
                  <button
                    aria-expanded={openFaq === i}
                    aria-controls={`answer-${i}`}
                    id={`question-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span className={styles.faqDot} />
                    <span>{question}</span>
                    <span className={styles.faqPlus}>
                      {openFaq === i ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                <div
                  className={styles.answer}
                  onTransitionEnd={() => controller.current?.refresh()}
                  id={`answer-${i}`}
                  role="region"
                  aria-labelledby={`question-${i}`}
                  inert={openFaq !== i}
                >
                  <div>
                    <p>{answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section
          id="contact"
          data-scene="contact"
          className={`${styles.scene} ${styles.contact}`}
        >
          <Label>08 — THE NEXT CHAPTER IS OURS TO BUILD</Label>
          <h2 data-contact-heading>
            LET’S SHAPE
            <br />
            SRI LANKA’S
            <br />
            AI FUTURE.
          </h2>
          <div className={styles.contactInfo}>
            <div>
              <Label>INQUIRIES & ENGAGEMENT</Label>
              <p>
                Have inquiries regarding the AIDSL 2026 summit, sponsorship
                deck, or community initiatives? Reach our coordination desk
                directly.
              </p>
            </div>
            <div>
              <Label>CONTACT & PARTNERSHIPS</Label>
              <p>
                <a href="mailto:aidrivensrilanka@gmail.com">
                  aidrivensrilanka@gmail.com
                </a>
                <br />
                <a href="tel:+94743538484">+94 74 353 8484</a>
                <br />
                Colombo, Sri Lanka
              </p>
            </div>
            <div>
              <Label>LET’S TALK</Label>
              <p>
                <a
                  href="https://wa.me/94743538484"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WHATSAPP US ↗
                </a>
                <br />
                <a href="mailto:aidrivensrilanka@gmail.com">SEND EMAIL ↗</a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <SummitFooter go={go} />
      <dialog
        ref={dialog}
        aria-labelledby="summit-inquiry-title"
        className={styles.dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <button
          className={styles.dialogClose}
          onClick={() => dialog.current.close()}
          aria-label="Close dialog"
        >
          ×
        </button>
        <Label>AIDSL 2026 SUMMIT</Label>
        <h2 id="summit-inquiry-title">
          {intent === "registration"
            ? "BE PART OF\nWHAT’S NEXT."
            : "BUILD THE\nFUTURE WITH US."}
        </h2>
        <p>
          {intent === "registration"
            ? "Registration details will be announced soon. Return to this page for the official registration link."
            : "Strategic, gold, technology, media and community partnership opportunities are planned. Partnership contact details will be announced soon."}
        </p>
        {intent === "registration" && (
          <a
            href="#register"
            onClick={(e) => {
              dialog.current.close();
              go(e, "register");
            }}
          >
            EXPLORE PASS OPTIONS ↗
          </a>
        )}
        <button onClick={() => dialog.current.close()}>
          KEEP EXPLORING ↗
        </button>
      </dialog>
    </div>
  );
}
